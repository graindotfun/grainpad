import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEvmReviewedTransaction, buildEvmExactApproval, simulateEvmReviewedTransaction, evmRecoveryStorageKey, watchEvmReviewInvalidation, inspectEvmFinalizedReceipt} from '../lib/chain/evm-transaction-safety.ts';
import {connectEvmWallet, discoverEvmWalletAdapters} from '../lib/chain/evm-wallet-adapter.ts';

const account='0x'+'1'.repeat(40), factory='0x'+'2'.repeat(40), quote='0x'+'3'.repeat(40), other='0x'+'4'.repeat(40), commit='a'.repeat(40);
const policy={chainId:8453,sourceCommit:commit,factory,wrappedNative:quote,allowedTargets:[factory,quote],approvedSpenders:[factory],executable:true,moneroRegistration:'required'};
const tx={chainId:8453,from:account,to:factory,data:'0x12345678',value:'0x0'};
function fakeProvider() {
  let chain='0x2105', accounts=[account];
  const calls=[], events=new Map();
  const provider={request:async args=>{
    calls.push(args);
    if(args.method==='eth_chainId') return chain;
    if(args.method==='eth_accounts'||args.method==='eth_requestAccounts') return accounts;
    if(args.method==='eth_call') return '0x';
    return null;
  },on:(event,listener)=>events.set(event,listener),removeListener:(event)=>events.delete(event)};
  return {provider,calls,events,setChain:value=>{chain=value;},setAccount:value=>{accounts=[value];}};
}
const review=()=>({sourceCommit:commit,factory,quoteAsset:quote,transaction:tx,expiresAt:60_000});

test('review rejects cross-chain/account/factory/quote/calldata/value and expired payloads before RPC',()=>{
  const session={chainId:8453,account,provider:fakeProvider().provider};
  assert.deepEqual(assertEvmReviewedTransaction(policy,session,review(),tx,0),tx);
  for(const alteration of [{chainId:1},{from:other},{to:other},{data:'0xdeadbeef'},{value:'0x1'}]) assert.throws(()=>assertEvmReviewedTransaction(policy,session,review(),{...tx,...alteration},0));
  for(const alteration of [{factory:other},{quoteAsset:other},{sourceCommit:'b'.repeat(40)},{expiresAt:0},{expiresAt:120_001}]) assert.throws(()=>assertEvmReviewedTransaction(policy,session,{...review(),...alteration},tx,0));
  assert.throws(()=>assertEvmReviewedTransaction({...policy,executable:false},session,review(),tx,0));
  const foreign={...tx,to:other};
  assert.throws(()=>assertEvmReviewedTransaction(policy,session,{...review(),transaction:foreign},foreign,0),/destination/);
});
test('exact token approval forbids uint256 unlimited or invalid amounts and binds spender',()=>{
  const approval=buildEvmExactApproval(8453,account,quote,factory,1000n);
  assert.equal(approval.data,'0x095ea7b3'+factory.slice(2).padStart(64,'0')+(1000n).toString(16).padStart(64,'0'));
  assert.equal(approval.value,'0x0');
  for(const amount of [0n,-1n,(1n<<256n)-1n,1n<<256n]) assert.throws(()=>buildEvmExactApproval(8453,account,quote,factory,amount));
  const session={chainId:8453,account,provider:fakeProvider().provider};
  assert.doesNotThrow(()=>assertEvmReviewedTransaction(policy,session,{...review(),transaction:approval},approval,0));
  const wrong=buildEvmExactApproval(8453,account,quote,other,1000n);
  assert.throws(()=>assertEvmReviewedTransaction(policy,session,{...review(),transaction:wrong},wrong,0),/spender/);
});
test('read-only simulation repeats chain/account checks and never requests signing or broadcast',async()=>{
  const f=fakeProvider(), session={chainId:8453,account,provider:f.provider};
  assert.deepEqual(await simulateEvmReviewedTransaction(policy,session,review(),tx,()=>0),{transaction:tx,result:'0x'});
  assert.deepEqual(f.calls.map(v=>v.method),['eth_chainId','eth_accounts','eth_chainId','eth_call','eth_chainId','eth_accounts','eth_chainId']);
  for(const change of ['chain','account']) {
    const p=fakeProvider(), original=p.provider.request;
    p.provider.request=async args=>{const result=await original(args); if(args.method==='eth_call') {if(change==='chain')p.setChain('0x1');else p.setAccount(other);}return result;};
    await assert.rejects(simulateEvmReviewedTransaction(policy,{chainId:8453,account,provider:p.provider},review(),tx,()=>0),/changed/);
  }
});
test('mutation while awaiting simulation cannot replace the reviewed payload',async()=>{
  const f=fakeProvider(), mutable={...tx}, r={...review(),transaction:{...tx}}, original=f.provider.request;
  f.provider.request=async args=>{const result=await original(args);if(args.method==='eth_call') {mutable.to=other;r.transaction.to=other;}return result;};
  await assert.rejects(simulateEvmReviewedTransaction(policy,{chainId:8453,account,provider:f.provider},r,mutable,()=>0),/differs/);
});
test('expiry during wallet simulation requires a fresh review',async()=>{
  const f=fakeProvider();let time=0;const original=f.provider.request;
  f.provider.request=async args=>{const result=await original(args);if(args.method==='eth_call')time=60_000;return result;};
  await assert.rejects(simulateEvmReviewedTransaction(policy,{chainId:8453,account,provider:f.provider},review(),tx,()=>time),/expired/);
});
test('wallet events invalidate review and dispose listeners; recovery is chain-account scoped',()=>{
  const f=fakeProvider();let invalidations=0;
  const dispose=watchEvmReviewInvalidation(f.provider,()=>invalidations++);
  for(const event of ['accountsChanged','chainChanged','disconnect']) f.events.get(event)();
  assert.equal(invalidations,3);dispose();assert.equal(f.events.size,0);
  assert.notEqual(evmRecoveryStorageKey(1,account),evmRecoveryStorageKey(8453,account));
  assert.notEqual(evmRecoveryStorageKey(1,account),evmRecoveryStorageKey(1,other));
});
const network={chainId:8453,name:'Source-reviewed network',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},publicRpcUrl:'https://public.example/rpc',explorerUrl:'https://explorer.example/',executable:true};
test('discovery and disabled onboarding cause no provider requests',async()=>{
  const f=fakeProvider();
  const wallets=await discoverEvmWalletAdapters({ethereum:{...f.provider,isMetaMask:true}});
  assert.equal(wallets[0].name,'MetaMask');assert.equal(f.calls.length,0);
  await assert.rejects(connectEvmWallet(f.provider,{...network,executable:false}),/not enabled/);
  assert.equal(f.calls.length,0);
});
test('connect rejects wrong chain after account approval and never signs',async()=>{
  const f=fakeProvider();await connectEvmWallet(f.provider,network);
  assert.equal(f.calls.some(v=>/send|sign/i.test(v.method)),false);
  const p=fakeProvider(), original=p.provider.request;
  p.provider.request=async args=>{const result=await original(args);if(args.method==='eth_requestAccounts')p.setChain('0x1');return result;};
  await assert.rejects(connectEvmWallet(p.provider,network),/changed/);
});
test('wallet addition switches explicitly and credentials never reach wallet metadata',async()=>{
  const f=fakeProvider(), original=f.provider.request;let missing=true;
  f.provider.request=async args=>{if(args.method==='wallet_switchEthereumChain'&&missing){missing=false;throw {code:4902};}return original(args);};
  await connectEvmWallet(f.provider,network);
  assert.ok(f.calls.some(v=>v.method==='wallet_addEthereumChain'));
  for(const publicRpcUrl of ['http://rpc.example/',['https://', 'user:secret', '@rpc.example/'].join(''),'https://rpc.example/?key=x','https://rpc.example/v2/private-key']) {
    const p=fakeProvider();await assert.rejects(connectEvmWallet(p.provider,{...network,publicRpcUrl}));assert.equal(p.calls.length,0);
  }
});
test('receipt recovery binds chain account hash original payload and canonical finalized block',async()=>{
  const hash='0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64);
  for(const state of ['success','reverted','pending','wrong-payload','wrong-chain','wrong-hash','reorg']) {
    const f=fakeProvider(),original=f.provider.request;
    f.provider.request=async args=>{
      if(args.method==='eth_getTransactionReceipt')return {transactionHash:state==='wrong-hash'?'0x'+'c'.repeat(64):hash,blockHash,blockNumber:'0x10',status:state==='reverted'?'0x0':'0x1'};
      if(args.method==='eth_getTransactionByHash')return {hash,chainId:state==='wrong-chain'?'0x1':'0x2105',from:account,to:factory,input:state==='wrong-payload'?'0xdeadbeef':tx.data,value:'0x0',blockHash,blockNumber:'0x10'};
      if(args.method==='eth_getBlockByNumber')return {number:state==='pending'?'0xf':'0x10',hash:state==='reorg'?'0x'+'c'.repeat(64):blockHash};
      return original(args);
    };
    const recover=()=>inspectEvmFinalizedReceipt(policy,{chainId:8453,account,provider:f.provider},{...review(),hash});
    if(['success','reverted','pending'].includes(state))assert.deepEqual(await recover(),{hash,status:state});
    else await assert.rejects(recover());
  }
});
