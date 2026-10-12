import test from 'node:test';import assert from 'node:assert/strict';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {Keypair,PublicKey} from '@solana/web3.js';import BN from 'bn.js';import * as sdk from '@raydium-io/raydium-sdk-v2';
import {exitScenarios} from '../lib/reality-check.mjs';import {QUOTES} from '../lib/quote-assets.mjs';
const creator=Keypair.generate().publicKey,mint=Keypair.generate().publicKey;
function market(symbol='SOL'){
 const quote=QUOTES[symbol],pool=sdk.LaunchpadPool.decode(Buffer.alloc(sdk.LaunchpadPool.span));
 Object.assign(pool,{mintA:mint,mintB:new PublicKey(quote.mint),mintDecimalsA:6,mintDecimalsB:quote.decimals,virtualA:new BN('1000000000000000'),realA:new BN('100000000000000'),virtualB:new BN('30000000000'),realB:new BN('10000000000'),configId:new PublicKey(quote.config),platformId:creator,creator,vaultA:mint,vaultB:creator});
 return {route:'curve',poolId:creator,pool,config:{curveType:0,tradeFeeRate:new BN(2500)},platform:{feeRate:new BN(2500),creatorFeeRate:new BN(2500)},quote};
}
test('exit sizes are independent, conserve exact amounts and keep pool fees out of price impact',()=>{
 const m=market(),r=exitScenarios(m,String(mint),String(creator),'1000000','1');
 assert.deepEqual(r.scenarios.map(s=>s.input),['250000000000','500000000000','1000000000000']);
 for(const s of r.scenarios){assert.equal(s.error,undefined);assert.ok(BigInt(s.output)<BigInt(s.spotValue));assert.equal(BigInt(s.minimum),BigInt(s.output)*99n/100n);assert.equal(s.fees.length,3);assert.ok(s.priceImpactBps>=0);}
 assert.ok(r.scenarios[0].priceImpactBps<r.scenarios[2].priceImpactBps);
 assert.equal(exitScenarios(m,String(mint),String(creator),'250000','1').scenarios[2].output,r.scenarios[0].output);
});
test('wXMR amounts retain twelve decimal units and are never converted into SOL',()=>{
 const r=exitScenarios(market('wXMR'),String(mint),String(creator),'1000000','0');assert.equal(r.quote.decimals,12);assert.equal(r.quote.symbol,'wXMR');for(const s of r.scenarios)assert.equal(s.output,s.minimum);
});
test('migration, invalid input, zero and excess slippage produce no sale quote',()=>{
 for(const [amount,slippage] of [['0','1'],['1e8','1'],['1.0000001','1'],['1','20.01'],['1','-1']])assert.throws(()=>exitScenarios(market(),String(mint),String(creator),amount,slippage));
 assert.throws(()=>exitScenarios({...market(),route:'graduating'},String(mint),String(creator),'1','1'),/Migration/);
 const r=exitScenarios(market(),String(mint),String(creator),'0.000001','1');assert.ok(r.scenarios[0].error);assert.ok(r.scenarios[1].error);
});
test('CPMM sell accounts for base fees, quote fees and reserve direction after graduation',()=>{
 const m=market(),p=sdk.CpmmPoolInfoLayout.decode(Buffer.alloc(sdk.CpmmPoolInfoLayout.span));
 Object.assign(p,{mintProgramA:TOKEN_PROGRAM_ID,mintProgramB:TOKEN_PROGRAM_ID,mintA:mint,mintB:new PublicKey(QUOTES.SOL.mint),baseReserve:new BN('1000000000000'),quoteReserve:new BN('100000000000'),enableCreatorFee:true,feeOn:sdk.FeeOn.BothToken,configInfo:{tradeFeeRate:new BN(2500),creatorFeeRate:new BN(10000),protocolFeeRate:new BN(120000),fundFeeRate:new BN(40000)}});
 const r=exitScenarios({...m,route:'cpmm',cpData:p},String(mint),String(creator),'10000','1');for(const s of r.scenarios){assert.equal(s.error,undefined);assert.ok(BigInt(s.output)<BigInt(s.spotValue));assert.ok(s.fees.some(f=>f.asset==='base'));assert.ok(s.priceImpactBps>=0);}
 const reverse={...p,mintA:p.mintB,mintB:p.mintA,baseReserve:p.quoteReserve,quoteReserve:p.baseReserve};
 assert.deepEqual(exitScenarios({...m,route:'cpmm',cpData:reverse},String(mint),String(creator),'10000','1').scenarios,r.scenarios);
});
test('a hypothetical curve sale cannot redeem tokens that have not entered circulation',()=>{
 const m=market(),r=exitScenarios(m,String(mint),String(creator),'200000000','1');assert.match(r.scenarios[2].error,/exceeds/);
});
