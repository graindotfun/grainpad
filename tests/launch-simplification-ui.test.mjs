import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
// Offline UI regressions for the approved launch simplifications. No wallet, network or transaction is used.
const hooks=`export function useState(initial){const f=globalThis.__simplifyUi,i=f.stateIndex++;if(!(i in f.states))f.states[i]=initial;return [f.states[i],v=>{f.states[i]=typeof v==='function'?v(f.states[i]):v;}];}export function useRef(initial){const f=globalThis.__simplifyUi,i=f.refIndex++;return f.refs[i]??(f.refs[i]={current:initial});}export function useEffect(fn,deps){fn.deps=deps;globalThis.__simplifyUi.effects.push(fn);}export function useEffectEvent(fn){return (...a)=>fn(...a);}export function useCallback(fn){return fn;}export function useMemo(fn){return fn();}export function useId(){return 'fixture';}export function useSyncExternalStore(){return null;}`;
const common={
 'next/image':`export default function Image(){return null;}`,'next/link':`export default function Link(){return null;}`,
 '@/components/use-shared-wallet':`export function useSharedWallet(ref){ref.current=globalThis.__simplifyUi.wallet;}`,
 '@/components/ui/button':`export const Button='button';`,'@/components/ui/input':`export const Input='input';`,'@/components/ui/textarea':`export const Textarea='textarea';`,
 '@/components/ui/tabs':`export const Tabs='div',TabsList='div',TabsTrigger='button',TabsContent='div';`,
 '@/components/site-header':`export function SiteHeader(){return null;}`,'@/components/kinetic-text':`export function KineticText({children}){return children;}`,
 '@/components/grain-select':`export function GrainSelect(){return null;}`,
 '@/hooks/use-blockhash-countdown':`export function useBlockhashCountdown(){return {ready:true,live:true,seconds:30,remainingBlocks:100};}`,
};
async function bundle(entry,outfile,stubs,patch=()=>null){
 await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{name:'simplify-ui-boundaries',setup(b){
  b.onResolve({filter:/^next\/(image|link)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/use-shared-wallet$/},()=>({path:'@/components/use-shared-wallet',namespace:'fixture'}));
  b.onResolve({filter:/^@\//},a=>{if(stubs[a.path])return {path:a.path,namespace:'fixture'};const alias=a.path.startsWith('@/lib/research/')?'data/lab-display.json':a.path.slice(2),base=join(process.cwd(),alias);return {path:['','.ts','.tsx','.mjs','.js'].map(ext=>base+ext).find(existsSync)};});
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='react'?hooks:stubs[a.path]}));
  b.onLoad({filter:/\.(mjs|ts)$/},a=>{const contents=patch(a.path);return contents==null?undefined:{contents,loader:a.path.endsWith('.ts')?'ts':'js'};});
 }}]});
 return import('../'+outfile);
}
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
const text=node=>node==null||typeof node==='boolean'?'':typeof node!=='object'?String(node):[node.props?.children].flat(Infinity).map(text).join('');
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};

// Protected Launch: frozen terms are on screen before the single click that signs and publishes.
const protectedStubs={...common,
 '@/lib/client-module-loading.mjs':`export function loadClientModule(load){return load();}export function clientModuleError(e){return e instanceof Error?e.message:String(e);}`,
 '@/lib/wallet':`export function openWalletPicker(){}`,
 '@/lib/protected-launch-browser':`const f=()=>globalThis.__simplifyUi;
  export async function draftProtectedLaunch(owner,draft){f().calls.push('draft');const commitment='commit:'+draft.name+':'+draft.cap+':'+draft.opensAt;return {terms:{nonce:draft.nonce,opensAt:draft.opensAt,closesAt:draft.closesAt,deadline:draft.deadline,capRaw:draft.cap+'000000000000',minimumTokenRaw:'1000000',taxBps:draft.taxBps,metadataHash:'a'.repeat(64),name:draft.name,symbol:draft.symbol,uri:'https://grainpad.fun/metadata/x.json'},metadata:{owner},publication:{},commitment,mint:'Mint1',launch:'Escrow1'};}
  export async function publishProtectedMetadata(wallet,draft){f().calls.push('sign-and-publish:'+draft.commitment);f().signs++;}
  export async function requestProtectedReview(input){f().calls.push('review:'+input.terms.name);return {reviews:[{id:'r',summary:{action:'create'},expiresAt:Date.now()+60000,maxDebitLamports:1,networkFeeLamports:1}],lookup:null};}
  export async function protectedJSON(){return {};}export async function submitProtectedReview(){throw Error('UI regression must never submit');}export async function recoverProtectedReceipt(){return {status:'pending'};}`,
};
const {ProtectedLaunchWorkspace}=await bundle('components/protected-launch-workspace.tsx','.test-output/launch-simplification-protected.mjs',protectedStubs);
const owner='Creator1111111111111111111111111111111111';
function protectedUi(){
 const future=new Date(Date.now()+3600000);future.setMinutes(future.getMinutes()-future.getTimezoneOffset());
 const f={states:[],refs:[],effects:[],calls:[],signs:0,wallet:{publicKey:{toBase58:()=>owner},signMessage:async()=>{throw Error('UI regression must use the client stub');}}};
 globalThis.__simplifyUi=f;
 const render=()=>{f.stateIndex=0;f.refIndex=0;f.effects=[];return ProtectedLaunchWorkspace();};
 render();Object.assign(f.states,{0:owner,3:{availability:{enabled:true,programId:'Program1',reason:null}},5:'Seed',6:'SEED',8:{base64:'AQ==',type:'image/png'},9:'7',11:future.toISOString().slice(0,16)});
 const primary=tree=>walk(tree).find(n=>n.type==='button'&&n.props.className==='primary-action');
 const showTerms=async()=>{render();const effect=f.effects.find(e=>e.toString().includes('buildDraft'));assert(effect,'live frozen-terms effect');effect();await new Promise(r=>setTimeout(r,300));await settle();};
 return {f,render,primary,showTerms};
}
test('protected: nothing is signed or published while the frozen terms are not on screen',async()=>{
 const {f,render,primary}=protectedUi(),tree=render(),action=primary(tree);
 assert.equal(text(action),'Prepare escrow creation');assert.equal(action.props.disabled,true,'disabled until the frozen terms are shown');
 action.props.onClick();await settle();
 assert.equal(f.signs,0);assert.deepEqual(f.calls,[]);assert.match(f.states[2],/frozen terms appear above/);
 assert(!walk(tree).some(n=>n.type==='button'&&text(n)==='Review frozen terms'),'the separate review click is gone');
});
test('protected: the frozen terms are displayed first, then one click signs, publishes and simulates those exact terms',async()=>{
 const {f,render,primary,showTerms}=protectedUi();await showTerms();
 assert.deepEqual(f.calls,['draft'],'computing the displayed terms is local and requests no signature');assert.equal(f.signs,0);
 const shown=f.states[22],tree=render();assert(shown);
 assert.match(text(walk(tree).find(n=>n.props?.['aria-label']==='Frozen launch terms')),new RegExp(shown.commitment));
 const action=primary(tree);assert.equal(action.props.disabled,false);
 action.props.onClick();await settle();
 assert.deepEqual(f.calls,['draft','draft','sign-and-publish:'+shown.commitment,'review:Seed'],'one click: recheck, then the only signature, then the review');
 assert.equal(f.signs,1);assert(f.states[21],'review is ready after a single click');assert.equal(f.states[2],'');
});
test('protected: terms that changed after display are shown again instead of being signed',async()=>{
 const {f,render,primary,showTerms}=protectedUi();await showTerms();
 f.states[22]={...f.states[22],commitment:'commit:stale'};f.calls.length=0;
 primary(render()).props.onClick();await settle();
 assert.deepEqual(f.calls,['draft']);assert.equal(f.signs,0);assert.match(f.states[2],/frozen terms changed/);assert.notEqual(f.states[22].commitment,'commit:stale');assert.equal(f.states[21],null);
});

test('protected: clearing the shown terms without changing a term input (cost-limit edit) still rebuilds them',async()=>{
 const {f,render,showTerms}=protectedUi();await showTerms();assert(f.states[22]);
 const deps=()=>{render();return f.effects.find(e=>e.toString().includes('buildDraft')).deps;},before=deps();
 const field=walk(render()).find(n=>n.type==='input'&&n.props.value==='0.02');assert(field,'cost-limit field');
 field.props.onChange({target:{value:'0.03'}});
 assert.equal(f.states[22],null,'the edit clears the shown terms');
 assert.notDeepEqual(deps(),before,'the frozen-terms effect re-runs even though no term input changed');
 f.calls.length=0;await showTerms();assert.deepEqual(f.calls,['draft']);assert(f.states[22],'terms are shown again, so the action is not stuck disabled');
});

// Regular Launch: one closed-launch notice. The lock value is patched only inside this offline bundle.
const regularStubs={...common,
 '@/lib/monero-prelaunch-browser.mjs':`export async function replacePlannedLaunchAuthorization(){throw Error('not used');}`,
 '@/lib/launch':`export const DEVNET_PLATFORM=null;export function solToLamports(){return 1;}export async function prepareLaunch(){throw Error('not used');}export async function refreshPreparedReview(p){return p;}export function signAndSend(){throw Error('UI regression must never submit');}`,
};
const lockSource=readFileSync('lib/platform-settings.mjs','utf8');
assert.match(lockSource,/TOKEN_CREATION_ENABLED=(?:true|false);/);
const {default:LockedLaunchWorkspace}=await bundle('components/launch-workspace.tsx','.test-output/launch-simplification-locked.mjs',regularStubs,path=>path.endsWith('lib/platform-settings.mjs')?lockSource.replace(/TOKEN_CREATION_ENABLED=(?:true|false);/,'TOKEN_CREATION_ENABLED=false;'):null);
test('regular: a locked launch shows one "not open yet" notice and keeps the action disabled',()=>{
 const f={states:[],refs:[],effects:[],wallet:null};globalThis.__simplifyUi=f;const old=globalThis.window;globalThis.window={location:{origin:'https://grainpad.fun'}};
 try{f.stateIndex=0;f.refIndex=0;const tree=LockedLaunchWorkspace({}),all=text(tree);
  assert.equal(all.match(/Launches are not open yet/g)?.length,1);assert.doesNotMatch(all,/Token creation is locked pending separate approval/);
  assert.match(all,/including after platform setup/,'the second notice’s detail is kept in the single notice');
  const primary=walk(tree).find(n=>n.type==='button'&&n.props.className==='primary-action');assert.equal(primary.props.disabled,true,'the lock still disables the action');
 }finally{globalThis.window=old;}
});
