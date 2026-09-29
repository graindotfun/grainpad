import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import * as s from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {QUOTES,quoteByMint} from './quote-assets.mjs';
import {assertGrainpadPolicy,decodePlatform} from './platform-policy.mjs';
import {assertRuleAccounts,expectedRuleAccounts,ruleAddresses,launchConstraints,RULE_DEFINITIONS} from './launch-rules.mjs';
const accountLink=address=>`https://explorer.solana.com/address/${address}`;
/** Current finalized state proof. History/keeper coverage is deliberately not inferred. */
export async function getLaunchProof(connection,mint,platform){
 const checks=[],check=(name,pass,observed)=>checks.push({name,status:pass?'PASS':'FAIL',observed});let slot=null,quote=null,pool=null,rules=[];
 try{
  const candidates=Object.values(QUOTES).map(q=>s.getPdaLaunchpadPoolId(s.LAUNCHPAD_PROGRAM,mint,new PublicKey(q.mint)).publicKey);
  const first=await connection.getMultipleAccountsInfoAndContext(candidates,{commitment:'finalized'});
  const matches=first.value.flatMap((a,i)=>a?.owner.equals(s.LAUNCHPAD_PROGRAM)?[candidates[i]]:[]);
  if(matches.length!==1)throw Error('Launch pool missing or ambiguous.');pool=matches[0];
  const read=await connection.getMultipleAccountsInfoAndContext([pool,mint,platform,...expectedRuleAccounts(platform)],{commitment:'finalized',minContextSlot:first.context.slot});slot=read.context.slot;
  const [pa,ma,platformAccount,...ruleAccounts]=read.value;
  if(!pa?.owner.equals(s.LAUNCHPAD_PROGRAM)||!ma?.owner.equals(TOKEN_PROGRAM_ID)||!platformAccount?.owner.equals(s.LAUNCHPAD_PROGRAM))throw Error('Missing account or invalid program owner.');
  const data=s.LaunchpadPool.decode(pa.data);quote=quoteByMint(data.mintB);
  check('Grainpad platform and quote identity',data.platformId.equals(platform)&&data.mintA.equals(mint)&&data.configId.toBase58()===quote.config,{platform:String(data.platformId),quote:quote.symbol,config:String(data.configId)});
  assertGrainpadPolicy(decodePlatform(platformAccount.data));check('Platform policy and restriction flags',true,{restrictGlobalConfig:1,restrictCurveParam:1});
  rules=assertRuleAccounts(platform,ruleAccounts);check('Both quote allowlists and exact group 0 rules',true,rules);
  const token=unpackMint(mint,ma,TOKEN_PROGRAM_ID);
  check('Six decimals, no transfer fee, revoked mint/freeze authorities',token.decimals===6&&data.mintDecimalsA===6&&data.mintDecimalsB===quote.decimals&&data.mintProgramFlag===0&&!token.mintAuthority&&!token.freezeAuthority,{decimals:token.decimals,mintAuthority:token.mintAuthority?.toBase58()||null,freezeAuthority:token.freezeAuthority?.toBase58()||null,tokenProgram:TOKEN_PROGRAM_ID.toBase58()});
  const context={curveType:0,migrateType:data.migrateType,migrateCpmmFeeOn:data.cpmmCreatorFeeOn,supply:data.supply,totalSellA:data.totalSellA,totalFundRaisingB:data.totalFundRaisingB,totalLockedAmount:data.vestingSchedule.totalLockedAmount,cliffPeriod:data.vestingSchedule.cliffPeriod,unlockPeriod:data.vestingSchedule.unlockPeriod,baseTokenProgram:0,unixTimestamp:new BN(Math.floor(Date.now()/1000))};
  const constraints=launchConstraints(quote.symbol);
  for(const [i,constraint] of constraints.entries()){const result=s.checkLaunchAgainstCurveRule({rule:{groups:[{groupId:0,epoch:new BN(0),constraints:[constraint]}]},context});check(RULE_DEFINITIONS[i][3],result.ok,{field:constraint.field,operator:constraint.op===0?'equal':'at least',expected:constraint.value.toString(),result});}
 }catch(e){check('Proof completed',false,e instanceof Error?e.message:String(e));}
 return {status:checks.length&&checks.every(x=>x.status==='PASS')?'PASS':'FAIL',checkedAt:new Date().toISOString(),slot,commitment:'finalized',quote,mint:String(mint),pool:pool?String(pool):null,platform:String(platform),accounts:[{label:'Token mint',address:String(mint),url:accountLink(mint)},{label:'PlatformConfig',address:String(platform),url:accountLink(platform)},...(pool?[{label:'Launch pool',address:String(pool),url:accountLink(pool)}]:[]),...Object.keys(QUOTES).flatMap(symbol=>{const a=ruleAddresses(platform,symbol);return [['GlobalConfig',a.config],['Allowlist',a.allow],['Group 0 rule',a.rule]].map(([label,address])=>({label:`${symbol} ${label}`,address:String(address),url:accountLink(address)}));})],checks,keeper:'SUPPORT_CONFIRMED',keeperEvidence:{source:'Raydium support Discord ticket, 2026-09-29 07:55 Israel time, reported by Grainpad founder',url:'/research/graduation-keeper-evidence.html',contractualGuarantee:false,onChainCoverageVerified:false},notice:'This snapshot checks current on-chain settings and stored launch parameters. The founder admin can change or remove rules and change fees. It does not establish historical rule state at creation or future keeper availability.'};
}
