import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const outfile='.test-output/public-creator-buy-ui.mjs';
const stubComponents={
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
 '@/lib/metadata-publication.mjs':`export async function buildMetadataPublication(draft){globalThis.__launchUi.publications.push(draft);return {uri:'https://grainpad.fun/metadata/fixture.json',metadataHash:'a'.repeat(64),profile:'fixture',imageUri:'https://grainpad.fun/image/fixture.png',imageHash:'b'.repeat(64)};}`,
};
await build({entryPoints:['components/launch-workspace.tsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{name:'public-ui-boundaries',setup(b){
 b.onResolve({filter:/^next\/(image|link)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 b.onResolve({filter:/^@\//},a=>{if(stubComponents[a.path])return {path:a.path,namespace:'fixture'};const alias=a.path.startsWith('@/lib/research/')?'data/lab-display.json':a.path.slice(2),base=join(process.cwd(),alias),path=['','.ts','.tsx','.mjs','.js'].map(ext=>base+ext).find(existsSync);return {path};});
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
const owner='HzGRGyX9Kspz3uY8Xk71zpARRK7t3fZVSecaEHNMEoce',mint='E3VuTQzZMSKaK2HxtGX1hLaAnxcmcR3MrAM8Bf6MFgrn';
async function withUi(run){
 const old={window:globalThis.window,fetch:globalThis.fetch,localStorage:globalThis.localStorage};
 const stored=new Map(),f={states:[],refs:[],effects:[],publications:[],preparations:[],metadataPosts:[],signs:0,preparedResult:{symbol:'CAT',mint,quoteAsset:'wXMR',platformName:'Grainpad',network:'mainnet-beta',estimatedLamports:10000000,balanceBeforeLamports:100000000,measuredDebitLamports:9000000,rewards:{taxBps:200},fees:{protocol:'25',platform:'75',creator:'25'},creatorBuy:null},wallet:{publicKey:{toBase58:()=>owner},signMessage:async()=>{f.signs++;return new Uint8Array(64).fill(7);}}};
 globalThis.__launchUi=f;globalThis.window={location:{origin:'https://grainpad.fun'}};globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/metadata');f.metadataPosts.push(JSON.parse(options.body));return Response.json({uri:'https://grainpad.fun/metadata/fixture.json',metadataHash:'a'.repeat(64)});};
 try{render(f);f.states[3]='Creator Cat';f.states[4]='CAT';f.states[8]='https://x.com/creatorcat';f.states[12]='data:image/png;base64,AQ==';f.states[15]=owner;f.states[16]=mint;f.states[32]={active:true};f.refs[0]={current:owner};f.refs[1]={current:{publicKey:{toBase58:()=>mint}}};return await run(f,stored);}finally{Object.assign(globalThis,old);delete globalThis.__launchUi;}
}

test('public creator buy defaults to zero and never converts an old metadata declaration into spending',()=>withUi(async(f,stored)=>{
 assert.equal(input(render(f),'creator-buy-amount').props.value,'0');stored.set('launch-lab-draft',JSON.stringify({name:'Legacy',symbol:'OLD',declaredCreatorBuy:'1.5'}));
 const tree=render(f),hydrate=f.effects.find(effect=>effect.toString().includes('launch-lab-draft'));assert(hydrate);hydrate();assert.equal(input(render(f),'creator-buy-amount').props.value,'0');assert.match(text(tree),/positive amount buys your token in the same transaction/);assert.doesNotMatch(text(tree),/Public declaration only/);
}));
test('selected positive amount binds signed metadata intent and actual launch preparation',()=>withUi(async f=>{
 input(render(f),'launch-transfer-tax').props.onChange({target:{value:'200'}});input(render(f),'creator-buy-amount').props.onChange({target:{value:'0.145'}});await button(render(f),'Prepare & simulate').props.onClick();
 assert.equal(f.preparations.length,1);assert.equal(f.preparations[0].creatorBuyAmount,'0.145');assert.equal(f.publications.length,1);assert.equal(f.metadataPosts[0].draft.creatorBuy.amountIn,'145000000000');assert.equal(f.metadataPosts[0].draft.creatorBuy.quote,'wXMR');assert.equal(f.metadataPosts[0].draft.creatorBuy.taxBps,200);assert.equal(f.metadataPosts[0].draft.declaredCreatorBuy,undefined);assert.equal(f.signs,1);
}));
test('zero keeps create-only metadata and unsigned preparation without inventing a purchase',()=>withUi(async f=>{
 await button(render(f),'Prepare & simulate').props.onClick();assert.equal(f.preparations[0].creatorBuyAmount,'0');assert.equal(f.metadataPosts[0].draft.creatorBuy,undefined);assert.match(text(render(f)),/no creator buy/);
}));
test('invalid purchase refuses before metadata wallet approval or transaction preparation',()=>withUi(async f=>{
 input(render(f),'creator-buy-amount').props.onChange({target:{value:'-0.1'}});await button(render(f),'Prepare & simulate').props.onClick();assert.equal(f.signs,0);assert.equal(f.publications.length,0);assert.equal(f.preparations.length,0);assert.match(text(render(f)),/up to 12 decimal places/);
}));
test('editing purchase amount invalidates prior review and acknowledgement; refresh also clears acknowledgement',()=>withUi(async f=>{
 f.states[23]=f.preparedResult;f.states[29]=true;input(render(f),'creator-buy-amount').props.onChange({target:{value:'0.2'}});assert.equal(f.states[23],null);assert.equal(f.states[29],false);
 f.states[23]=f.preparedResult;f.states[29]=true;await button(render(f),'Refresh review').props.onClick();assert.equal(f.states[29],false);
}));
test('actual review preserves12decimal quote and6decimal token precision and separates SOL costs',()=>{
 const buy={amountIn:'145000000001',curvePrincipalRaw:'143187500001',totalCurveFeeRaw:'1812500000',expectedNetOutputRaw:'20906213618421',simulatedNetOutputRaw:'20906213618421',minOut:'20697151482236',transferFeeRaw:'426657420784',balanceBeforeRaw:'300000000001',quoteDecimals:12,tokenDecimals:6,slippageBps:100};
 const html=renderToStaticMarkup(createElement(LaunchCreatorBuyReview,{buy,symbol:'CAT'}));assert.match(html,/0\.145000000001 wXMR/);assert.match(html,/20,697,151\.482236 CAT/);assert.match(html,/0\.155 wXMR/);assert.match(html,/Trading fee · included in total/);assert.match(html,/SOL account rent and network fees are shown separately/);assert.match(html,/overflow-wrap:anywhere/);assert.equal(formatLaunchUnits('1',12),'0.000000000001');assert.equal(renderToStaticMarkup(createElement(LaunchCreatorBuyReview,{buy:null,symbol:'CAT'})),'');
});
