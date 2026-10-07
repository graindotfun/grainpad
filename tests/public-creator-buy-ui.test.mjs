import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createElement} from 'react';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {renderToStaticMarkup} from 'react-dom/server';
const outfile='.test-output/public-creator-buy-ui.mjs';
const candidate=process.env.GRAINPAD_LAUNCH_UI_CHECKOUT||process.cwd();
const stubComponents={
 '@/lib/monero-prelaunch-browser.mjs':`export async function replacePlannedLaunchAuthorization(prepared,wallet,mint){const f=globalThis.__launchUi;(f.provenanceReplacements??=[]).push(prepared);if(f.provenanceFailure)throw f.provenanceFailure;return {authorized:true};}`,
 'next/image':`export default function Image(){return null;}`,
 'next/link':`export default function Link(){return null;}`,
 '@/components/use-shared-wallet':`export function useSharedWallet(ref){ref.current=globalThis.__launchUi.wallet;}`,
 '@/hooks/use-blockhash-countdown':`export function useBlockhashCountdown(){return {ready:true,live:true,seconds:30,remainingBlocks:100};}`,
 '@/components/ui/button':`export const Button='button';`,
 '@/components/ui/input':`export const Input='input';`,
 '@/components/ui/textarea':`export const Textarea='textarea';`,
 '@/components/ui/tabs':`export const Tabs='div',TabsList='div',TabsTrigger='button',TabsContent='div';`,
 '@/components/site-header':`export function SiteHeader(){return null;}`,
 '@/lib/launch':`export const DEVNET_PLATFORM=null;export function solToLamports(){return 1;}export async function prepareLaunch(input){globalThis.__launchUi.preparations.push(input);return globalThis.__launchUi.preparedResult;}export async function refreshPreparedReview(p){return p;}export function signAndSend(){throw Error('UI regression must never submit');}`,
 '@/lib/metadata-publication.mjs':`export async function contentHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}export async function buildMetadataPublication(draft){globalThis.__launchUi.publications.push(draft);return {uri:'https://grainpad.fun/metadata/fixture.json',metadataHash:'a'.repeat(64),profile:'fixture',imageUri:'https://grainpad.fun/image/fixture.png',imageHash:'b'.repeat(64)};}`,
};
await build({entryPoints:[join(candidate,'components/launch-workspace.tsx')],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{name:'public-ui-boundaries',setup(b){
 b.onResolve({filter:/^next\/(image|link)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 b.onResolve({filter:/^@\//},a=>{if(stubComponents[a.path])return {path:a.path,namespace:'fixture'};const alias=a.path.startsWith('@/lib/research/')?'data/lab-display.json':a.path.slice(2),base=join(candidate,alias),path=['','.ts','.tsx','.mjs','.js'].map(ext=>base+ext).find(existsSync);return {path};});
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='react'?`export function useState(initial){const f=globalThis.__launchUi,i=f.stateIndex++;if(!(i in f.states))f.states[i]=initial;return [f.states[i],v=>{f.states[i]=typeof v==='function'?v(f.states[i]):v;}];}export function useRef(initial){const f=globalThis.__launchUi,i=f.refIndex++;return f.refs[i]??(f.refs[i]={current:initial});}export function useEffect(fn){globalThis.__launchUi.effects.push(fn);}export function useCallback(fn){return fn;}export function useMemo(fn){return fn();}export function useId(){return 'fixture';}export function useSyncExternalStore(){return null;}`:stubComponents[a.path]}));
 }}]});
const {default:LaunchWorkspace}=await import('../'+outfile);
await build({entryPoints:['components/launch-creator-buy-review.tsx'],outfile:'.test-output/public-creator-buy-review.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
const {LaunchCreatorBuyReview,formatLaunchUnits}=await import('../.test-output/public-creator-buy-review.mjs');
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
const text=node=>node==null||typeof node==='boolean'?'':typeof node!=='object'?String(node):[node.props?.children].flat(Infinity).map(text).join('');
function render(f){f.stateIndex=0;f.refIndex=0;f.effects=[];return LaunchWorkspace({});}
const input=(tree,id)=>walk(tree).find(n=>n.type==='input'&&n.props.id===id);
const button=(tree,label)=>walk(tree).find(n=>n.type==='button'&&text(n)===label);
const creatorKey=nacl.sign.keyPair(),owner=bs58.encode(creatorKey.publicKey),mint='E3VuTQzZMSKaK2HxtGX1hLaAnxcmcR3MrAM8Bf6MFgrn';
async function withUi(run){
 const old={window:globalThis.window,fetch:globalThis.fetch,localStorage:globalThis.localStorage,FileReader:globalThis.FileReader};
 const stored=new Map(),f={states:[],refs:[],effects:[],publications:[],preparations:[],metadataPosts:[],readers:[],signs:0,preparedResult:{owner,symbol:'CAT',mint,quoteAsset:'wXMR',platformName:'Grainpad',network:'mainnet-beta',estimatedLamports:10000000,balanceBeforeLamports:100000000,measuredDebitLamports:9000000,rewards:{taxBps:200},fees:{protocol:'25',platform:'75',creator:'25'},creatorBuy:null},wallet:{publicKey:{toBase58:()=>owner},signMessage:async bytes=>{f.signs++;return nacl.sign.detached(bytes,creatorKey.secretKey);}}};
 globalThis.__launchUi=f;globalThis.FileReader=class {readAsDataURL(file){this.file=file;f.readers.push(this);}};globalThis.window={location:{origin:'https://grainpad.fun'}};globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/metadata');f.metadataPosts.push(JSON.parse(options.body));return Response.json({uri:'https://grainpad.fun/metadata/fixture.json',metadataHash:'a'.repeat(64)});};
 try{render(f);f.states[3]='Creator Cat';f.states[4]='CAT';f.states[8]='https://x.com/creatorcat';f.states[12]='data:image/png;base64,AQ==';f.states[15]=owner;f.states[19]=mint;f.states[35]={active:true};f.refs[3]={current:owner};f.refs[4]={current:{publicKey:{toBase58:()=>mint}}};return await run(f,stored);}finally{Object.assign(globalThis,old);delete globalThis.__launchUi;}
}

test('public creator buy defaults to zero and never converts an old metadata declaration into spending',()=>withUi(async(f,stored)=>{
 assert.equal(input(render(f),'creator-buy-amount').props.value,'0');stored.set('launch-lab-draft',JSON.stringify({name:'Legacy',symbol:'OLD',declaredCreatorBuy:'1.5'}));
 const tree=render(f),hydrate=f.effects.find(effect=>effect.toString().includes('launch-lab-draft'));assert(hydrate);hydrate();assert.equal(input(render(f),'creator-buy-amount').props.value,'0');assert.match(text(tree),/positive amount buys your token in the same transaction/);assert.doesNotMatch(text(tree),/Public declaration only/);
}));
test('selected positive amount binds signed metadata intent and actual launch preparation',()=>withUi(async f=>{
 input(render(f),'launch-transfer-tax').props.onChange({target:{value:'200'}});input(render(f),'creator-buy-amount').props.onChange({target:{value:'0.145'}});await button(render(f),'Prepare launch').props.onClick();
 assert.equal(f.preparations.length,1);assert.equal(f.preparations[0].creatorBuyAmount,'0.145');assert.equal(f.publications.length,1);assert.equal(f.metadataPosts[0].draft.creatorBuy.amountIn,'145000000000');assert.equal(f.metadataPosts[0].draft.creatorBuy.quote,'wXMR');assert.equal(f.metadataPosts[0].draft.creatorBuy.taxBps,200);assert.equal(f.metadataPosts[0].draft.declaredCreatorBuy,undefined);assert.equal(f.signs,1);
}));
test('zero keeps create-only metadata and unsigned preparation without inventing a purchase',()=>withUi(async f=>{
 await button(render(f),'Prepare launch').props.onClick();assert.equal(f.preparations[0].creatorBuyAmount,'0');assert.equal(f.metadataPosts[0].draft.creatorBuy,undefined);assert.match(text(render(f)),/no creator buy/);
}));
test('invalid purchase refuses before metadata wallet approval or transaction preparation',()=>withUi(async f=>{
 input(render(f),'creator-buy-amount').props.onChange({target:{value:'-0.1'}});await button(render(f),'Prepare launch').props.onClick();assert.equal(f.signs,0);assert.equal(f.publications.length,0);assert.equal(f.preparations.length,0);assert.match(text(render(f)),/up to 12 decimal places/);
}));
test('editing purchase amount invalidates prior review and acknowledgement; refresh also clears acknowledgement',()=>withUi(async f=>{
 f.states[26]=f.preparedResult;f.states[32]=true;input(render(f),'creator-buy-amount').props.onChange({target:{value:'0.2'}});assert.equal(f.states[26],null);assert.equal(f.states[32],false);
 f.states[26]=f.preparedResult;f.states[32]=true;await button(render(f),'Refresh review').props.onClick();assert.equal(f.states[32],false);
}));
test('actual review preserves12decimal quote and6decimal token precision and separates SOL costs',()=>{
 const buy={amountIn:'145000000001',curvePrincipalRaw:'143187500001',totalCurveFeeRaw:'1812500000',expectedNetOutputRaw:'20906213618421',simulatedNetOutputRaw:'20906213618421',minOut:'20697151482236',transferFeeRaw:'426657420784',balanceBeforeRaw:'300000000001',quoteDecimals:12,tokenDecimals:6,slippageBps:100};
 const html=renderToStaticMarkup(createElement(LaunchCreatorBuyReview,{buy,symbol:'CAT'}));assert.match(html,/0\.145000000001 wXMR/);assert.match(html,/20,697,151\.482236 CAT/);assert.match(html,/0\.155 wXMR/);assert.match(html,/Trading fee · included in total/);assert.match(html,/SOL account rent and network fees are shown separately/);assert.match(html,/overflow-wrap:anywhere/);assert.equal(formatLaunchUnits('1',12),'0.000000000001');assert.equal(renderToStaticMarkup(createElement(LaunchCreatorBuyReview,{buy:null,symbol:'CAT'})),'');
});

const primary=tree=>walk(tree).filter(n=>n.type==='button'&&n.props.className==='primary-action');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('actual pending image reader disables the only primary action and blocks a stale Prepare handler',()=>withUi(async f=>{
 const before=render(f),prepare=button(before,'Prepare launch');assert.equal(primary(before).length,1);assert.equal(prepare.props.disabled,false);
 const picker=walk(before).find(n=>n.type==='input'&&n.props.type==='file'&&n.props.accept==='image/png,image/jpeg,image/webp');assert(picker);
 picker.props.onChange({target:{files:[{name:'cat-selected.png',size:10,type:'image/png'}],value:'selected'}});
 assert.equal(f.readers.length,1);assert.equal(primary(render(f))[0].props.disabled,true);assert.match(text(render(f)),/Reading your selected image/);
 // Calling the old enabled button still cannot escape the live ref guard.
 await prepare.props.onClick();assert.equal(f.signs,0);assert.equal(f.metadataPosts.length,0);assert.equal(f.preparations.length,0);
 const reader=f.readers[0];reader.result='data:image/png;base64,Ag==';reader.onload();await settle();
 const tree=render(f);assert.equal(primary(tree)[0].props.disabled,false);assert.match(text(tree),/cat-selected.png/);
 const selected=walk(tree).find(n=>n.props?.className==='launch-upload-selected'&&text(n).includes('cat-selected.png'));assert(selected);
 const download=walk(selected).find(n=>n.type==='a'&&n.props.download==='cat-selected.png');assert.equal(download.props.href,'data:image/png;base64,Ag==');
 button(selected,'Remove').props.onClick();const cleared=render(f);assert.doesNotMatch(text(cleared),/cat-selected.png/);assert.equal(walk(cleared).filter(n=>n.props?.className==='launch-upload-selected').length,0);assert.equal(primary(cleared).length,1);
}));
test('only primary action changes from preparation to deploy and requires exact-review acknowledgement',()=>withUi(async f=>{
 const start=render(f);assert.equal(primary(start).length,1);assert.equal(text(primary(start)[0]),'Prepare launch');
 await button(start,'Prepare launch').props.onClick();let tree=render(f);assert.equal(primary(tree).length,1);assert.equal(text(primary(tree)[0]),'Deploy token');assert.equal(primary(tree)[0].props.disabled,true);
 const acknowledgement=walk(tree).find(n=>n.props?.className==='check-label');assert(acknowledgement);const ack=walk(acknowledgement).find(n=>n.type==='input'&&n.props.type==='checkbox');assert(ack);ack.props.onChange({target:{checked:true}});tree=render(f);assert.equal(primary(tree)[0].props.disabled,false);
 input(tree,'creator-buy-amount').props.onChange({target:{value:'0.1'}});tree=render(f);assert.equal(primary(tree).length,1);assert.equal(text(primary(tree)[0]),'Prepare launch');assert.equal(f.states[32],false);
}));

 test('public provenance conflict reuses the main action for one explicit message, preserves review and requires a new acknowledgement',()=>withUi(async f=>{
  f.states[26]={...f.preparedResult,metadataHash:'a'.repeat(64)};f.states[32]=true;f.states[23]='No submission was attempted. Planned immutable identity or source policy changed.';f.states[36]='static';
  const before=f.states[26],tree=render(f),action=button(tree,'Approve updated token details');assert(action);assert.equal(action.props.disabled,false);assert.match(text(tree),/original approval stays in history/);
  await action.props.onClick();assert.equal(f.provenanceReplacements.length,1);assert.equal(f.provenanceReplacements[0].mint,mint);assert.equal(f.provenanceReplacements[0].owner,owner);assert.equal(f.provenanceReplacements[0].metadataHash,'a'.repeat(64));assert.equal(f.states[26],before);assert.equal(f.states[32],false);assert.equal(f.states[36],'static');assert.match(f.states[24],/no transaction was sent/);assert.equal(f.preparations.length,0);assert.equal(f.signs,0);assert(button(render(f),'Deploy token').props.disabled);
 }));
 test('public replacement refuses a switched creator before any message and keeps the pending review',()=>withUi(async f=>{
  f.states[26]=f.preparedResult;f.states[32]=true;f.states[23]='Planned immutable identity or source policy changed.';f.wallet.publicKey={toBase58:()=>bs58.encode(nacl.sign.keyPair().publicKey)};
  await button(render(f),'Approve updated token details').props.onClick();assert.equal(f.provenanceReplacements,undefined);assert.equal(f.states[26],f.preparedResult);assert.match(f.states[23],/original creator/);assert.equal(f.signs,0);
 }));
