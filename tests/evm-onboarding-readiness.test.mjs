import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3';
import {EVM_NETWORK_TEMPLATES} from '../lib/chain/evm-network-manifest.ts';
import {inspectEvmOnboarding} from '../lib/chain/evm-onboarding-readiness.ts';
import {chainOnboarding} from '../scripts/chain-onboarding.mjs';

const hex=bytes=>Buffer.from(bytes).toString('hex');
const selector=signature=>'0x'+hex(keccak_256(new TextEncoder().encode(signature))).slice(0,8);
const abi=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
const commit='a'.repeat(40),code='0x6000',hash='0x'+hex(keccak_256(Uint8Array.from([0x60,0]))),blockHash='0x'+'b'.repeat(64);
function fixture() {
  const names=['factory','curve','vault','wrappedNative','dexFactory','positionManager','router','quoter'];
  const contracts=Object.fromEntries(names.map((name,i)=>[name,{address:'0x'+String(i+1).repeat(40),runtimeCodeHash:hash,sourceCommit:commit}]));
  const economics={totalSupply:'1000',saleInventory:'800',liquidityReserve:'200',virtualQuote:'1',virtualToken:'200',graduationQuote:'4',approvalId:'example-owner-selection'};
  const candidate={...EVM_NETWORK_TEMPLATES[0],deployment:{sourceCommit:commit,contracts},feePolicy:{platformBps:35,creatorBps:65,tradeBps:0,approvalId:'example-owner-selection'},economics,platformRecipient:'0x'+'9'.repeat(40),dexPolicy:{adapter:'uniswap-v3',poolFeePips:10000,tickSpacing:200}};
  const answers=new Map();
  const put=(name,signature,value)=>answers.set(contracts[name].address+':'+selector(signature),abi(value));
  for(const [name,sig,target] of [['factory','curve()','curve'],['factory','vault()','vault'],['curve','factory()','factory'],['curve','vault()','vault'],['curve','quote()','wrappedNative'],['curve','DEX_FACTORY()','dexFactory'],['curve','POSITION_MANAGER()','positionManager'],['vault','curve()','curve'],['vault','quote()','wrappedNative'],['positionManager','factory()','dexFactory']])put(name,sig,contracts[target].address);
  for(const [name,sig,value] of [['wrappedNative','decimals()',18],['factory','totalSupply()',1000],['factory','saleSupply()',800],['curve','liquiditySupply()',200],['curve','virtualQuote()',1],['curve','virtualToken()',200],['curve','graduationQuote()',4],['curve','platformFeeBps()',35],['curve','creatorFeeBps()',65],['curve','tradeFeeBps()',0]])put(name,sig,value);
  put('vault','platform()',candidate.platformRecipient);
  for(const [name,sig,target] of [['positionManager','WETH9()','wrappedNative'],['router','factoryV3()','dexFactory'],['router','WETH9()','wrappedNative'],['quoter','factory()','dexFactory'],['quoter','WETH9()','wrappedNative']])put(name,sig,contracts[target].address);
  answers.set(contracts.dexFactory.address+':'+selector('feeAmountTickSpacing(uint24)')+(10000n).toString(16).padStart(64,'0'),abi(200));
  const calls=[];
  const rpc=async(method,params)=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0x2105';
    if(method==='eth_getBlockByNumber')return {number:'0x100',hash:blockHash};
    if(method==='eth_getCode')return code;
    if(method==='eth_call')return answers.get(params[0].to+':'+params[0].data);
    throw new Error('unexpected RPC');
  };
  return {candidate,rpc,calls,answers};
}
test('disabled templates report missing deployment and make no network request',async()=>{
  for(const candidate of EVM_NETWORK_TEMPLATES) {
    const report=await inspectEvmOnboarding(candidate,()=>{throw new Error('RPC must not run');});
    assert.equal(report.executable,false);assert.equal(report.onchainChecksPassed,false);
    assert.ok(report.remainingGates.some(item=>/Monero/.test(item)));
  }
});
test('matching runtime, finalized canonical block and wiring remain a read-only report, never release GO',async()=>{
  const f=fixture(),report=await inspectEvmOnboarding(f.candidate,f.rpc);
  assert.equal(report.onchainChecksPassed,true);assert.equal(report.executable,false);
  assert.equal(report.namespace,'eip155:8453');assert.equal(report.observedFinalizedBlock,'0x100');
  assert.ok(f.calls.filter(call=>call.method==='eth_getCode'||call.method==='eth_call').every(call=>call.params[1]==='0x100'));
  assert.ok(f.calls.every(call=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(call.method)));
});
test('wrong chain fails before any contract reads; code or fee mismatches never pass',async()=>{
  const wrong=fixture();
  const report=await inspectEvmOnboarding(wrong.candidate,async(method,params)=>method==='eth_chainId'?'0x1':wrong.rpc(method,params));
  assert.equal(report.onchainChecksPassed,false);assert.equal(wrong.calls.length,0);
  const codeMismatch=fixture();codeMismatch.candidate.deployment.contracts.router.runtimeCodeHash='0x'+'c'.repeat(64);
  assert.equal((await inspectEvmOnboarding(codeMismatch.candidate,codeMismatch.rpc)).onchainChecksPassed,false);
  const feeMismatch=fixture();feeMismatch.answers.set(feeMismatch.candidate.deployment.contracts.curve.address+':'+selector('platformFeeBps()'),abi(100));
  assert.equal((await inspectEvmOnboarding(feeMismatch.candidate,feeMismatch.rpc)).onchainChecksPassed,false);
  const recipientMismatch=fixture();recipientMismatch.candidate.platformRecipient='0x'+'a'.repeat(40);
  assert.equal((await inspectEvmOnboarding(recipientMismatch.candidate,recipientMismatch.rpc)).onchainChecksPassed,false);
});
test('unsupported fee legs cap or uint128 economics cannot look ready or access RPC',async()=>{
  for(const mode of ['extra-leg','over-cap','zero-total','wide-economics']) {
    const f=fixture();
    if(mode==='extra-leg')f.candidate.feePolicy.tradeBps=1;
    if(mode==='over-cap')f.candidate.feePolicy.platformBps=1001;
    if(mode==='zero-total'){f.candidate.feePolicy.platformBps=0;f.candidate.feePolicy.creatorBps=0;}
    if(mode==='wide-economics')f.candidate.economics.virtualQuote=(1n<<128n).toString();
    const report=await inspectEvmOnboarding(f.candidate,()=>{throw new Error('Unsupported candidate must not access RPC');});
    assert.equal(report.onchainChecksPassed,false);assert.equal(report.executable,false);assert.equal(f.calls.length,0);
    assert.ok(report.checks.some(item=>item.check==='supported-generic-curve-profile'&&!item.passed));
  }
});
test('chain change and finalized reorg invalidate completed observations; provider secrets are redacted',async()=>{
  for(const drift of ['chain','block']) {
    const f=fixture();let chainCalls=0;
    const report=await inspectEvmOnboarding(f.candidate,async(method,params)=>{
      if(method==='eth_chainId'&&++chainCalls===2&&drift==='chain')return '0x1';
      if(method==='eth_getBlockByNumber'&&params[0]!=='finalized'&&drift==='block')return {number:'0x100',hash:'0x'+'c'.repeat(64)};
      return f.rpc(method,params);
    });
    assert.equal(report.onchainChecksPassed,false);
  }
  const f=fixture(),report=await inspectEvmOnboarding(f.candidate,async()=>{throw new Error('https://provider/private-key-secret');});
  assert.equal(JSON.stringify(report).includes('private-key-secret'),false);
});
test('offline operator CLI plans Base Ethereum and BNB without enabling execution or reading secrets',async()=>{
  for(const template of ['base','ethereum','bnb']) {
    const result=await chainOnboarding(['--template',template],()=>{throw new Error('No request allowed');});
    assert.equal(result.mode,'offline-plan');assert.equal(result.executable,false);
    assert.ok(result.steps.includes('verify-monero-registration'));
  }
  for(const url of ['https://rpc.example/v2/private-key','https://rpc.example/?key=secret',['https://', 'user:secret', '@rpc.example/'].join(''),'http://rpc.example/'])await assert.rejects(chainOnboarding(['--template','base','--public-rpc',url]),/public HTTPS/);
  await assert.rejects(chainOnboarding(['--template','base','--enable','true']));
});
