/** Public, human-readable author approval. This never authorizes a chain transaction. */
import {crewAsset,crewAmountPattern} from './crew.mjs';
export const ROOM_ACTIONS=['need','submission','update','credit','close','declare-buy','budget','approve','payment'];
/** Crew records: the creator promises a budget, approves work and links finalized payments. */
export const CREW_ACTIONS=['budget','approve','payment'];
const crewLines={
 budget:p=>[`Promised budget: ${p.body} ${p.title}`,'This is a public promise. It is not escrow, a payment or a transaction.'],
 approve:p=>[`Note: ${p.body}`,'Approval accepts this work publicly. It is not a payment or a transaction.'],
 payment:p=>[`Asset: ${p.title}`,`Payment transaction: ${p.body}`,'This links a transfer already made. Signing it moves no funds.'],
};
export function roomMessage(p){
 const head=[`Origin: ${p.origin}`,`Network: mainnet-beta`,`Token: ${p.mint}`,`Author: ${p.author}`,`Action: ${p.kind}`];
 if(CREW_ACTIONS.includes(p.kind)){const [detail,...rest]=crewLines[p.kind](p);return ['Grainpad Crew · publish a public record',...head,detail,...rest.slice(0,-1),`Related record: ${p.target}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,rest.at(-1)].join('\n');}
 return ['Grainpad Launch Room · publish a public record',...head,`Title: ${p.title}`,`Text: ${p.body}`,`Link: ${p.url}`,`Related record: ${p.target}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This is a public message, not a payment or transaction.'].join('\n');
}
export function validateRoomPayload(p,origin,mint,now=Date.now()){
 const fields=['origin','mint','author','kind','title','body','url','target','nonce','expires'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==fields.length||Object.keys(p).some(key=>!fields.includes(key)))throw Error('Publication contains fields outside the signed schema.');
 const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 if(!p||p.origin!==origin||p.mint!==mint||!address.test(p.author)||!address.test(mint)||!ROOM_ACTIONS.includes(p.kind)||!uuid.test(p.nonce))throw Error('Invalid publication identity.');
 if(!Number.isSafeInteger(p.expires)||p.expires<=now||p.expires>now+300000)throw Error('Message expired. Review and sign again.');
 for(const [key,max] of [['title',100],['body',3000],['url',500],['target',36]])if(typeof p[key]!=='string'||p[key].length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(p[key]))throw Error(`Invalid ${key}.`);
 if(/[\r\n]/.test(p.title+p.url+p.target))throw Error('Use a single-line title and link.');
 if(['need','submission','update'].includes(p.kind)&&(!p.title.trim()||!p.body.trim()))throw Error('Add a title and description.');
 if(['submission','credit','close',...CREW_ACTIONS].includes(p.kind)?!uuid.test(p.target):p.target!=='')throw Error('Invalid related record.');
 if(p.url){const u=new URL(p.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS link without credentials.');}
 if(p.kind==='declare-buy'&&!/^(0|[1-9]\d{0,12})(\.\d{1,12})?$/.test(p.body))throw Error('Declare a non-negative amount in the launch quote asset.');
 if(CREW_ACTIONS.includes(p.kind)){
  if(p.url)throw Error('Crew records do not carry a link.');
  if(p.kind==='approve'){if(p.title!=='Approved')throw Error('Invalid approval.');}
  else{
   const asset=crewAsset(p.title,p.mint);
   if(p.kind==='budget'&&(!crewAmountPattern(asset.decimals).test(p.body)||!/[1-9]/.test(p.body)))throw Error(`Enter a budget above zero with up to ${asset.decimals} decimals.`);
   if(p.kind==='payment'&&!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(p.body))throw Error('Paste the payment transaction signature.');
  }
 }
 return p;
}
