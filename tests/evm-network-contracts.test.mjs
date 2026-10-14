import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3';
import {getEvmNetworkTemplate} from '../lib/chain/evm-network-manifest.ts';
import {inspectEvmDexContractCandidate,planEvmContractParameterization} from '../lib/chain/evm-network-contracts.ts';
const selector = signature => '0x'+Buffer.from(keccak_256(new TextEncoder().encode(signature))).toString('hex').slice(0,8);
const word = value => '0x'+BigInt(value).toString(16).padStart(64,'0');
const block={number:'0x64',hash:'0x'+'f'.repeat(64)};
function candidate() {
  const value=structuredClone(getEvmNetworkTemplate('base'));
  value.platformRecipient='0x'+'9'.padStart(40,'0');
  value.dexPolicy={adapter:'uniswap-v3',poolFeePips:10000,tickSpacing:200};
  value.feePolicy={platformBps:40,creatorBps:60,tradeBps:0,approvalId:'disposable-test-only'};
  value.economics={totalSupply:'1000',saleInventory:'800',liquidityReserve:'200',virtualQuote:'10',virtualToken:'200',graduationQuote:'40',approvalId:'disposable-test-only'};
  value.deployment={sourceCommit:'b'.repeat(40),contracts:Object.fromEntries(['factory','curve','vault','wrappedNative','dexFactory','positionManager','router','quoter'].map((role,index)=>[role,{address:'0x'+(index+1).toString(16).padStart(40,'0'),runtimeCodeHash:'0x'+'a'.repeat(64),sourceCommit:'b'.repeat(40)}]))};
  return value;
}
function fakeRpc(value, transform = (_method,_params,result)=>result) {
  const seen=[]; const c=Object.fromEntries(Object.entries(value.deployment.contracts).map(([key,pin])=>[key,pin.address]));
  const responses=new Map([
    [c.vault+selector('platform()'),word(value.platformRecipient)],
    [c.curve+selector('POSITION_MANAGER()'),word(c.positionManager)],
    [c.curve+selector('DEX_FACTORY()'),word(c.dexFactory)],
    [c.positionManager+selector('factory()'),word(c.dexFactory)],
    [c.positionManager+selector('WETH9()'),word(c.wrappedNative)],
    [c.router+selector('factoryV3()'),word(c.dexFactory)],
    [c.router+selector('WETH9()'),word(c.wrappedNative)],
    [c.quoter+selector('factory()'),word(c.dexFactory)],
    [c.quoter+selector('WETH9()'),word(c.wrappedNative)],
    [c.dexFactory+selector('feeAmountTickSpacing(uint24)')+BigInt(value.dexPolicy.poolFeePips).toString(16).padStart(64,'0'),word(value.dexPolicy.tickSpacing)],
  ]);
  const rpc=async(method,params)=>{
    seen.push({method,params});
    let result;
    if(method==='eth_chainId') result='0x2105';
    else if(method==='eth_getBlockByNumber') result=block;
    else if(method==='eth_call') result=responses.get(params[0].to+params[0].data);
    else throw new Error('Unexpected RPC or mutation');
    return transform(method,params,result);
  };
  return {rpc,seen};
}

test('DEX recipient/wrapper/factory/tier inspection is read-only, finalized and never grants GO',async()=>{
  const value=candidate(); const {rpc,seen}=fakeRpc(value);
  const result=await inspectEvmDexContractCandidate(rpc,value,block);
  assert.equal(result.dexBindingsMatch,true); assert.equal(result.executionAllowed,false);
  assert.equal(result.blockHash,block.hash);
  assert.ok(result.remaining.includes('runtime-source-pins-and-curve-policy-inspection'));
  for(const call of seen.filter(call=>call.method==='eth_call')) assert.equal(call.params[1],block.number);
  assert.ok(seen.every(call=>['eth_chainId','eth_call','eth_getBlockByNumber'].includes(call.method)));
});

test('reject wrong chain before contract reads, missing candidate before RPC',async()=>{
  const value=candidate();const wrong=fakeRpc(value,(method,_params,result)=>method==='eth_chainId'?'0x1':result);
  await assert.rejects(inspectEvmDexContractCandidate(wrong.rpc,value),/chain differs/);
  assert.equal(wrong.seen.length,1);
  const good=fakeRpc(value);
  await assert.rejects(inspectEvmDexContractCandidate(good.rpc,getEvmNetworkTemplate('base')),/Complete/);
  assert.equal(good.seen.length,0);
});

test('reject mismatched platform, wrapper, DEX factory or tier even with valid address shapes',async()=>{
  for(const signature of ['platform()','WETH9()','factoryV3()','factory()','DEX_FACTORY()','feeAmountTickSpacing(uint24)']) {
    const value=candidate();const {rpc}=fakeRpc(value,(method,params,result)=>method==='eth_call'&&params[0].data.startsWith(selector(signature))?word(77):result);
    await assert.rejects(inspectEvmDexContractCandidate(rpc,value),/differs/);
  }
});

test('malformed ABI addresses cannot be silently truncated',async()=>{
  const value=candidate();const {rpc}=fakeRpc(value,(method,_params,result)=>method==='eth_call'?word(1n<<160n):result);
  await assert.rejects(inspectEvmDexContractCandidate(rpc,value),/address word/);
});

test('reject nonfinalized or noncanonical anchors and changed final chain',async()=>{
  const value=candidate();const rpc=fakeRpc(value).rpc;
  await assert.rejects(inspectEvmDexContractCandidate(rpc,value,{...block,number:'0x65'}),/canonical and finalized/);
  await assert.rejects(inspectEvmDexContractCandidate(rpc,value,{...block,hash:'0x'+'a'.repeat(64)}),/canonical and finalized/);
  let chains=0;
  const changed=fakeRpc(value,(method,_params,result)=>method==='eth_chainId'&&++chains>1?'0x1':result).rpc;
  await assert.rejects(inspectEvmDexContractCandidate(changed,value),/snapshot changed/);
});

test('parameterization makes missing generic Solidity explicit and binds independently selected policy',()=>{
  const plan=planEvmContractParameterization(candidate());
  assert.equal(plan.executable,false);assert.equal(plan.existingRobinhoodBytecodeReusable,false);
  assert.equal(plan.immutableInputs.chainId,8453);
  assert.equal(plan.immutableInputs.feePolicy.platformBps,40);
  assert.ok(plan.requiredSourceChanges.some(value=>value.includes('locker')));
  assert.ok(plan.requiredAcceptance.includes('real-DEX-fork-mint-swap-collect'));
  assert.ok(plan.requiredAcceptance.includes('Monero-publication'));
  assert.throws(()=>planEvmContractParameterization(getEvmNetworkTemplate('bnb')),/Complete/);
  const value=candidate();value.economics.virtualQuote=(1n<<128n).toString();
  assert.throws(()=>planEvmContractParameterization(value),/uint128/);
});
