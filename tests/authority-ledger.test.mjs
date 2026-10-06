import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,Keypair} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {buildAuthorityLedger,ledgerAccountKeys,holderLabel,programDataAddress,programUpgradeAuthority,MAINNET,WATCHED_PROGRAMS} from '../lib/authority-ledger.mjs';
import {ledgerFreshness,LEDGER_STALE_AFTER_MS} from '../lib/authority-ledger-freshness.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {POLICY,grainpadPlatformId} from '../lib/platform-policy.mjs';
import {expectedRuleAccounts} from '../lib/launch-rules.mjs';
import {REWARDS_DEPLOYMENT} from '../lib/rewards-deployment.mjs';
import {GRAIN_FEE_FREEZE_POLICY as G} from '../lib/fee-freeze-review.mjs';
import {QUOTES} from '../lib/quote-assets.mjs';

const b64=a=>({...a,owner:String(a.owner),data:[Buffer.from(a.data).toString('base64'),'base64']});
const k=v=>v?new PublicKey(v):PublicKey.default;
function mint({config=G.authority,withdraw=G.withdrawAuthority,bps=200,newerBps=bps,newerEpoch=1050n,mintAuthority=null,freeze=null,program=spl.TOKEN_2022_PROGRAM_ID}={}){
 const base=Buffer.alloc(program===spl.TOKEN_PROGRAM_ID?82:166);spl.MintLayout.encode({mintAuthorityOption:mintAuthority?1:0,mintAuthority:k(mintAuthority),supply:10n**15n,decimals:6,isInitialized:true,freezeAuthorityOption:freeze?1:0,freezeAuthority:k(freeze)},base);
 if(program===spl.TOKEN_PROGRAM_ID)return b64({owner:program,data:base,lamports:1});
 base[165]=1;const fee=Buffer.alloc(spl.TRANSFER_FEE_CONFIG_SIZE);
 spl.TransferFeeConfigLayout.encode({transferFeeConfigAuthority:k(config),withdrawWithheldAuthority:k(withdraw),withheldAmount:0n,olderTransferFee:{epoch:1050n,maximumFee:10n**15n,transferFeeBasisPoints:bps},newerTransferFee:{epoch:newerEpoch,maximumFee:10n**15n,transferFeeBasisPoints:newerBps}},fee);
 const h=Buffer.alloc(4);h.writeUInt16LE(spl.ExtensionType.TransferFeeConfig);h.writeUInt16LE(fee.length,2);
 return b64({owner:program,data:Buffer.concat([base,h,fee]),lamports:1});
}
function pool(m,status=2){const p=sdk.LaunchpadPool.decode(Buffer.alloc(sdk.LaunchpadPool.span));Object.assign(p,{status,mintA:new PublicKey(m),mintB:new PublicKey(QUOTES.wXMR.mint),platformId:grainpadPlatformId(),configId:new PublicKey(QUOTES.wXMR.config),creator:PublicKey.default,supply:new BN(0),totalSellA:new BN(0),totalFundRaisingB:new BN(0)});const d=Buffer.alloc(sdk.LaunchpadPool.span);sdk.LaunchpadPool.encode(p,d);return b64({owner:sdk.LAUNCHPAD_PROGRAM,data:d,lamports:1});}
function platform(over={}){const p=sdk.PlatformConfig.decode(Buffer.alloc(944));Object.assign(p,{platformClaimFeeWallet:k(PLATFORM_SETTINGS.claimAuthority),platformLockNftWallet:k(PLATFORM_SETTINGS.feeKeyWallet),platformVestingWallet:k(PLATFORM_SETTINGS.vestingWallet),platformScale:new BN(1000000),feeRate:new BN(POLICY.platformRate),creatorFeeRate:new BN(POLICY.creatorRate),cpConfigId:k(POLICY.cpConfig),transferFeeExtensionAuth:k(PLATFORM_SETTINGS.transferAuthority),restrictGlobalConfig:1,restrictCurveParam:1,...over});const d=Buffer.alloc(944);sdk.PlatformConfig.encode(p,d);return b64({owner:sdk.LAUNCHPAD_PROGRAM,data:d,lamports:1});}
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
function programAccount(dataAddress){const d=Buffer.alloc(36);d.writeUInt32LE(2,0);new PublicKey(dataAddress).toBuffer().copy(d,4);return b64({owner:loader,data:d,lamports:1});}
function programData(authority){const d=Buffer.alloc(45);d.writeUInt32LE(3,0);if(authority){d[12]=1;new PublicKey(authority).toBuffer().copy(d,13);}return b64({owner:loader,data:d,lamports:1});}
function fullRead(over={}){
 const platformId=String(grainpadPlatformId()),[,solAllow,,,wxmrAllow]=expectedRuleAccounts(grainpadPlatformId()).map(String);
 const curve={mint:String(Keypair.generate().publicKey),pool:String(Keypair.generate().publicKey)};
 const accounts={[platformId]:platform(),[solAllow]:null,[wxmrAllow]:b64({owner:sdk.LAUNCHPAD_PROGRAM,data:Buffer.alloc(137),lamports:1}),[G.mint]:mint(),[G.pool]:pool(G.mint),[QUOTES.wXMR.mint]:mint({program:spl.TOKEN_PROGRAM_ID,mintAuthority:'2yy692W8JX511d63i5BdKHqULJCnQyBYrfnkavnzjZuE'}),
  [curve.mint]:mint({config:String(sdk.getPdaLaunchpadAuth(sdk.LAUNCHPAD_PROGRAM).publicKey),bps:100}),[curve.pool]:pool(curve.mint,0)};
 const upgrade=String(Keypair.generate().publicKey),programDataMap={};
 for(const p of WATCHED_PROGRAMS){const pd=String(Keypair.generate().publicKey);accounts[p.id]=programAccount(pd);programDataMap[p.id]=programData(upgrade);}
 return {genesis:MAINNET,epoch:1050,slot:453991042,observedAt:1_000_000,source:'test',accounts,programData:programDataMap,curves:[curve],curveDiscovery:{source:'test index',complete:true},...over};
}
const find=(ledger,id)=>ledger.sections.flatMap(s=>s.items).find(i=>i.id===id);

test('a matching read marks GRAIN and legacy pins as matching the published settings',()=>{
 const l=buildAuthorityLedger(fullRead());
 assert.equal(l.genesisVerified,true);assert.deepEqual(l.warnings,[]);
 for(const id of ['grain-graduation','grain-tax-rate','grain-tax-withdraw','grain-mint','grain-freeze','legacy-fee-rate','legacy-cp-creator','legacy-transfer-auth','legacy-claim','legacy-fee-key','legacy-rule-manager','admission-sol'])assert.equal(find(l,id).status,'matches-published',id);
 assert.equal(find(l,'grain-tax-rate').holder.kind,'grainpad-operator');
 assert.equal(find(l,'legacy-admin').holder.kind,'grainpad-founder');
 assert.equal(find(l,'admission-wxmr').note,'Admission is open.');
 assert.equal(find(l,'wxmr-mint').status,'observed');assert.equal(find(l,'wxmr-freeze').holder.kind,'revoked');
 assert.equal(find(l,`program-${WATCHED_PROGRAMS[0].id}`).status,'observed');
 const curve=l.sections.find(s=>s.id==='existing').curves[0];assert.equal(curve.taxRate.kind,'program');assert.equal(curve.withdraw.kind,'grainpad-operator');assert.equal(curve.graduated,false);
});

test('off-chain custody, entitlements and deployment are declared, never presented as chain reads',()=>{
 const l=buildAuthorityLedger(fullRead());
 for(const id of ['ops-custody','ops-entitlements','ops-payout-burn','ops-treasury','ops-deploy','wxmr-bridge','raydium-keeper','new-platform','grain-fee-key']){const i=find(l,id);assert.equal(i.status,'declared',id);assert.equal(i.evidence.type,'declared',id);}
 assert.match(find(l,'ops-custody').controls,/does not by itself limit funds already held/);
 assert.match(find(l,'ops-deploy').controls,/does not prove the served build/);
});

test('drift is reported as differs and raised as a warning',()=>{
 const read=fullRead(),platformId=String(grainpadPlatformId()),rogue=String(Keypair.generate().publicKey);
 read.accounts[platformId]=platform({platformCpCreator:new PublicKey(rogue),feeRate:new BN(10000)});
 read.accounts[G.mint]=mint({withdraw:rogue});
 const l=buildAuthorityLedger(read);
 for(const id of ['legacy-cp-creator','legacy-fee-rate','grain-tax-withdraw'])assert.equal(find(l,id).status,'differs',id);
 assert.equal(find(l,'grain-tax-withdraw').holder.kind,'unknown');
 assert(l.warnings.some(w=>/CPMM creator/.test(w)));assert(l.counts.differs>=3);
});

test('a scheduled tax change is surfaced for GRAIN and for curves',()=>{
 const read=fullRead();read.accounts[G.mint]=mint({newerBps:10000,newerEpoch:1052n});
 const l=buildAuthorityLedger(read);
 assert(l.warnings.some(w=>/GRAIN has a transfer-tax change scheduled for epoch 1052/.test(w)));
 assert.match(find(l,'grain-tax-rate').note,/CHANGE SCHEDULED/);
 assert.match(find(l,'grain-tax-rate').note,/Current tax 2%/);
 assert.match(find(buildAuthorityLedger({...read,epoch:1052}),'grain-tax-rate').note,/Current tax 100%/);
 read.accounts[read.curves[0].mint]=mint({bps:100,newerBps:500,newerEpoch:1052n});
 assert.equal(buildAuthorityLedger(read).sections.find(s=>s.id==='existing').curves[0].taxBasisPoints,100);
});

test('unread accounts are unavailable, and a non-mainnet genesis hides every on-chain value',()=>{
 const missing=fullRead();delete missing.accounts[G.mint];
 assert.equal(find(buildAuthorityLedger(missing),'grain-tax-rate').status,'unavailable');
 assert.equal(find(buildAuthorityLedger(missing),'grain-tax-rate').holder,null);
 const devnet=buildAuthorityLedger(fullRead({genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'}));
 assert.equal(devnet.genesisVerified,false);
 assert(devnet.sections.flatMap(s=>s.items).every(i=>i.status==='unavailable'||i.status==='declared'));
 const empty=buildAuthorityLedger({accounts:{}});assert.equal(empty.counts['matches-published'],0);assert(empty.counts.declared>0);
});

test('freshness: failed reads and old reads never look current',()=>{
 const ledger=buildAuthorityLedger(fullRead());
 assert.equal(ledgerFreshness({ledger},ledger.observedAt+1000).state,'fresh');
 assert.equal(ledgerFreshness({ledger,stale:true},ledger.observedAt+1000).state,'stale');
 assert.equal(ledgerFreshness({ledger},ledger.observedAt+LEDGER_STALE_AFTER_MS+1).state,'stale');
 assert.equal(ledgerFreshness({ledger,error:'read-failed'}).state,'failed');
 assert.equal(ledgerFreshness(null).state,'failed');
 assert.equal(ledgerFreshness({ledger:buildAuthorityLedger({accounts:{}})}).state,'failed');
});

test('labels never guess; program upgrade authority decoding handles immutable programs',()=>{
 assert.equal(holderLabel(String(Keypair.generate().publicKey)).kind,'unknown');assert.equal(holderLabel(null).kind,'revoked');
 assert.equal(holderLabel(REWARDS_DEPLOYMENT.collector).kind,'grainpad-operator');
 const pd=String(Keypair.generate().publicKey);assert.equal(programDataAddress(programAccount(pd)),pd);
 assert.equal(programUpgradeAuthority(programData(null)),null);
 assert.equal(programUpgradeAuthority({owner:'other',data:['','base64']}),undefined);
 const keys=ledgerAccountKeys([{mint:'m',pool:'p'}]);assert(keys.includes(G.mint)&&keys.includes(G.pool)&&keys.includes('m')&&keys.includes('p'));assert.equal(new Set(keys).size,keys.length);
});

