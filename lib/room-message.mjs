/** Public, human-readable author approval. This never authorizes a chain transaction. */
export const ROOM_ACTIONS=['need','submission','update','credit','close','declare-buy'];
export function roomMessage(p){
 return ['Grainpad Launch Room · publish a public record',`Origin: ${p.origin}`,`Network: mainnet-beta`,`Token: ${p.mint}`,`Author: ${p.author}`,`Action: ${p.kind}`,`Title: ${p.title}`,`Text: ${p.body}`,`Link: ${p.url}`,`Related record: ${p.target}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This is a public message, not a payment or transaction.'].join('\n');
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
 if(['submission','credit','close'].includes(p.kind)?!uuid.test(p.target):p.target!=='')throw Error('Invalid related record.');
 if(p.url){const u=new URL(p.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS link without credentials.');}
 if(p.kind==='declare-buy'&&!/^(0|[1-9]\d{0,12})(\.\d{1,12})?$/.test(p.body))throw Error('Declare a non-negative amount in the launch quote asset.');
 return p;
}
