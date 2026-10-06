/** "Who controls what": a pure model built from raw finalized account bytes.
 * No RPC, keys or signing here. The caller supplies the accounts it read and when.
 * Every item says where its value came from:
 *   matches-published  read on chain and equal to the published source pin
 *   differs            read on chain and NOT equal to the published pin (shown as an alert)
 *   observed           read on chain; there is no pin to compare against
 *   unavailable        the account could not be read; nothing is shown as current
 *   declared           a Grainpad statement about off-chain control; this page cannot read it */
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,unpackMint,getTransferFeeConfig,getExtensionData,ExtensionType} from '@solana/spl-token';
import {unpack as unpackTokenMetadata} from '@solana/spl-token-metadata';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {POLICY,grainpadPlatformId,decodePlatform} from './platform-policy.mjs';
import {expectedRuleAccounts} from './launch-rules.mjs';
import {REWARDS_DEPLOYMENT} from './rewards-deployment.mjs';
import {QUOTES} from './quote-assets.mjs';
import {GRAIN_FEE_FREEZE_POLICY} from './fee-freeze-review.mjs';
import {OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';

export const LEDGER_SCHEMA='grainpad.authority-ledger.v1';
export const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export {LEDGER_STALE_AFTER_MS,ledgerFreshness} from './authority-ledger-freshness.mjs';
const ZERO=PublicKey.default.toBase58();
const LAUNCH_PDA=String(sdk.getPdaLaunchpadAuth(sdk.LAUNCHPAD_PROGRAM).publicKey);
const BPF_UPGRADEABLE='BPFLoaderUpgradeab1e11111111111111111111111';
export const WATCHED_PROGRAMS=Object.freeze([
 {id:String(sdk.LAUNCHPAD_PROGRAM),name:'Raydium LaunchLab',role:'Bonding curves, platform configuration and graduation'},
 {id:String(sdk.CREATE_CPMM_POOL_PROGRAM),name:'Raydium CPMM',role:'Pools after graduation'},
 {id:String(sdk.LOCK_CPMM_PROGRAM),name:'Raydium LP lock',role:'Holds graduated liquidity permanently locked'},
 {id:String(TOKEN_2022_PROGRAM_ID),name:'SPL Token-2022',role:'Token accounts, transfer tax and its authorities'},
]);

/** Public labels for known addresses. An unknown address is never guessed. */
export function holderLabel(address){
 if(address===null)return {address:null,label:'Revoked — no one can use this',kind:'revoked'};
 if(address===PLATFORM_SETTINGS.admin)return {address,label:'Grainpad admin — one founder-held key',kind:'grainpad-founder'};
 if(address===REWARDS_DEPLOYMENT.collector)return {address,label:'Grainpad collector — automated hot key on the operator server',kind:'grainpad-operator'};
 if(address===OFFICIAL_LAUNCH_CREATOR)return {address,label:'Official GRAIN creator wallet — founder-held',kind:'grainpad-founder'};
 if(address===LAUNCH_PDA)return {address,label:'Raydium LaunchLab program address (PDA)',kind:'program'};
 return {address,label:'Unlabelled address',kind:'unknown'};
}
export const explorerLinks=address=>address?[{label:'Solscan',url:`https://solscan.io/account/${address}`},{label:'Solana Explorer',url:`https://explorer.solana.com/address/${address}`}]:[];

const bytes=a=>a?Buffer.from(Array.isArray(a.data)?a.data[0]:a.data,Array.isArray(a.data)?'base64':undefined):null;
const keyOrNull=k=>k&&!k.equals(PublicKey.default)?String(k):null;
function item({id,title,holder,controls,canMoveFunds,scope,account,field,expected,observed,status,note}){
 const h=holder===undefined?null:holderLabel(holder);
 return {id,title,holder:h,controls,canMoveFunds,scope,note:note??null,
  evidence:account?{type:'on-chain',account,field,links:explorerLinks(account),expected:expected??null,observed:observed??null}:{type:'declared'},status};
}
const compare=(observed,expected)=>observed===undefined?'unavailable':expected===undefined?'observed':String(observed)===String(expected)?'matches-published':'differs';

export function decodeLedgerMint(address,account){
 if(!account)return null;
 const owner=String(account.owner),data=bytes(account),program=owner===String(TOKEN_2022_PROGRAM_ID)?TOKEN_2022_PROGRAM_ID:new PublicKey(owner);
 if(owner!==String(TOKEN_2022_PROGRAM_ID)&&owner!==String(TOKEN_PROGRAM_ID))return null;
 const token=unpackMint(new PublicKey(address),{owner:program,data,lamports:account.lamports??0,executable:false},program);
 const out={owner,mintAuthority:keyOrNull(token.mintAuthority),freezeAuthority:keyOrNull(token.freezeAuthority),supply:String(token.supply),decimals:token.decimals,transferFee:null,metadataUpdateAuthority:undefined};
 if(owner!==String(TOKEN_2022_PROGRAM_ID))return out;
 const fee=getTransferFeeConfig(token),f=x=>({epoch:String(x.epoch),basisPoints:x.transferFeeBasisPoints,maximumFee:String(x.maximumFee)});
 if(fee)out.transferFee={configAuthority:keyOrNull(fee.transferFeeConfigAuthority),withdrawAuthority:keyOrNull(fee.withdrawWithheldAuthority),older:f(fee.olderTransferFee),newer:f(fee.newerTransferFee)};
 const md=getExtensionData(ExtensionType.TokenMetadata,token.tlvData);
 if(md){const m=unpackTokenMetadata(md);out.metadataUpdateAuthority=keyOrNull(m.updateAuthority);}
 return out;
}
export function decodeLedgerPool(account){
 if(!account||String(account.owner)!==String(sdk.LAUNCHPAD_PROGRAM))return null;
 const p=sdk.LaunchpadPool.decode(bytes(account));
 return {mint:String(p.mintA),quoteMint:String(p.mintB),platform:String(p.platformId),status:p.status,creator:String(p.creator)};
}
export function programDataAddress(account){
 const d=bytes(account);if(!d||String(account.owner)!==BPF_UPGRADEABLE||d.length!==36||d.readUInt32LE(0)!==2)return null;
 return new PublicKey(d.subarray(4,36)).toBase58();
}
export function programUpgradeAuthority(account){
 const d=bytes(account);if(!d||String(account.owner)!==BPF_UPGRADEABLE||d.length<45||d.readUInt32LE(0)!==3)return undefined;
 return d[12]===1?new PublicKey(d.subarray(13,45)).toBase58():null;
}
const statusName=s=>({0:'bonding curve (not graduated)',1:'graduating',2:'graduated'})[s]??`unknown (${s})`;
const effectiveFee=(fee,epoch)=>fee?(BigInt(epoch??0)>=BigInt(fee.newer.epoch)?fee.newer:fee.older):null;
const scheduled=(fee,epoch)=>!!fee&&BigInt(fee.newer.epoch)>BigInt(epoch??0);

/** `read` = {genesis, epoch, slot, observedAt, accounts:{[address]: account|null|undefined}, programData:{[programId]: account|null},
 *  curves:[{mint,pool}], curveDiscovery:{source, complete}}. A missing key means "not read". */
export function buildAuthorityLedger(read){
 const acc=read?.accounts??{},has=k=>Object.hasOwn(acc,k)&&acc[k]!==undefined,platformId=String(grainpadPlatformId());
 const warnings=[];if(read?.genesis!==MAINNET)warnings.push('Network genesis was not verified as Solana mainnet-beta. On-chain values are not shown.');
 const onChain=read?.genesis===MAINNET;
 const get=k=>onChain&&has(k)?acc[k]:undefined;
 // ── Legacy platform ────────────────────────────────────────────────────────────
 const platformAccount=get(platformId),platform=platformAccount&&String(platformAccount.owner)===String(sdk.LAUNCHPAD_PROGRAM)?decodePlatform(bytes(platformAccount)):undefined,pf=k=>platform?platform[k]:undefined;
 const [,solAllow,,,wxmrAllow]=expectedRuleAccounts(grainpadPlatformId()).map(String);
 const allowState=k=>get(k)===undefined?undefined:get(k)===null?'closed':'open';
 // ── GRAIN ──────────────────────────────────────────────────────────────────────
 const G=GRAIN_FEE_FREEZE_POLICY,grainMint=get(G.mint)===undefined?undefined:decodeLedgerMint(G.mint,get(G.mint)),grainPool=get(G.pool)===undefined?undefined:decodeLedgerPool(get(G.pool));
 const gf=grainMint?.transferFee;
 if(gf&&scheduled(gf,read.epoch))warnings.push(`GRAIN has a transfer-tax change scheduled for epoch ${gf.newer.epoch}.`);
 const grain=[
  item({id:'grain-graduation',title:'Graduation state',controls:'Whether GRAIN still trades on the LaunchLab curve or on its graduated CPMM pool.',canMoveFunds:false,scope:'GRAIN',account:G.pool,field:'LaunchLab pool status',expected:2,observed:grainPool?.status,status:grainPool===null?'unavailable':compare(grainPool?.status,2),note:grainPool?statusName(grainPool.status):null}),
  item({id:'grain-tax-rate',title:'Tax-rate authority',holder:gf?gf.configAuthority:undefined,controls:'Can change GRAIN\'s transfer tax, up to 100%. A change takes effect two epochs after it is scheduled.',canMoveFunds:true,scope:'GRAIN',account:G.mint,field:'TransferFeeConfig.transferFeeConfigAuthority',expected:G.authority,observed:gf?.configAuthority,status:compare(gf?gf.configAuthority:undefined,G.authority),note:gf?`Current tax ${effectiveFee(gf,read.epoch).basisPoints/100}% (maximum ${effectiveFee(gf,read.epoch).maximumFee} raw)${scheduled(gf,read.epoch)?`; CHANGE SCHEDULED for epoch ${gf.newer.epoch}`:'; no change scheduled'}. Freezing this authority is prepared but not executed.`:null}),
  item({id:'grain-tax-withdraw',title:'Tax withdrawal authority',holder:gf?gf.withdrawAuthority:undefined,controls:'Can withdraw all withheld GRAIN tax to any account, and can hand this authority to any other key.',canMoveFunds:true,scope:'GRAIN',account:G.mint,field:'TransferFeeConfig.withdrawWithheldAuthority',expected:G.withdrawAuthority,observed:gf?.withdrawAuthority,status:compare(gf?gf.withdrawAuthority:undefined,G.withdrawAuthority)}),
  item({id:'grain-mint',title:'Mint authority',holder:grainMint?grainMint.mintAuthority:undefined,controls:'Could create new GRAIN.',canMoveFunds:true,scope:'GRAIN',account:G.mint,field:'Mint.mintAuthority',expected:null,observed:grainMint?.mintAuthority,status:compare(grainMint?grainMint.mintAuthority:undefined,null)}),
  item({id:'grain-freeze',title:'Freeze authority',holder:grainMint?grainMint.freezeAuthority:undefined,controls:'Could freeze any GRAIN account.',canMoveFunds:true,scope:'GRAIN',account:G.mint,field:'Mint.freezeAuthority',expected:null,observed:grainMint?.freezeAuthority,status:compare(grainMint?grainMint.freezeAuthority:undefined,null)}),
  item({id:'grain-metadata',title:'Token metadata update authority',holder:grainMint?.metadataUpdateAuthority,controls:'Can change the on-chain name, symbol and metadata URI.',canMoveFunds:false,scope:'GRAIN',account:G.mint,field:'TokenMetadata.updateAuthority',observed:grainMint?.metadataUpdateAuthority,status:compare(grainMint?.metadataUpdateAuthority,undefined)}),
  item({id:'grain-fee-key',title:'Locked-liquidity fee key (LP fee rights)',holder:REWARDS_DEPLOYMENT.collector,controls:'Claims trading fees earned by GRAIN\'s permanently locked liquidity and can transfer that right. It cannot withdraw the locked liquidity.',canMoveFunds:true,scope:'GRAIN',status:'declared',note:'At graduation LaunchLab sends this NFT to the platform lock-NFT wallet, which is the collector. This page does not read the NFT holder.'}),
 ];
 // ── Existing curves on the legacy platform ─────────────────────────────────────
 const curves=(read?.curves??[]).filter(c=>c.mint!==G.mint).map(c=>{
  const m=get(c.mint)===undefined?undefined:decodeLedgerMint(c.mint,get(c.mint)),p=get(c.pool)===undefined?undefined:decodeLedgerPool(get(c.pool)),f=m?.transferFee;
  if(f&&scheduled(f,read.epoch))warnings.push(`${c.mint} has a transfer-tax change scheduled for epoch ${f.newer.epoch}.`);
  return {mint:c.mint,pool:c.pool,links:explorerLinks(c.mint),status:p?statusName(p.status):p===null?'pool not found':'not read',graduated:p?.status===2,
   taxBasisPoints:effectiveFee(f,read.epoch)?.basisPoints??null,taxRate:f?holderLabel(f.configAuthority):null,withdraw:f?holderLabel(f.withdrawAuthority):null,
   mintAuthority:m?holderLabel(m.mintAuthority):null,freezeAuthority:m?holderLabel(m.freezeAuthority):null,scheduledChange:f?scheduled(f,read.epoch):null,read:!!m&&!!p};
 });
 const legacy=[
  item({id:'legacy-admin',title:'Legacy platform admin',holder:PLATFORM_SETTINGS.admin,controls:'Changes the platform and creator curve fees for every curve that has not graduated, with no delay; changes fee destinations and the CPMM creator assigned at graduation; opens or closes launch admission. LaunchLab binds this admin to the platform permanently; it cannot be moved into a multisig.',canMoveFunds:true,scope:'All legacy curves until each graduates; future launches while admission is open',account:platformId,field:'PDA seed (platform address is derived from this key)',status:platformAccount===undefined?'unavailable':platformAccount===null?'differs':'matches-published',note:'Verified by address derivation: the platform account exists at the address derived from this key.'}),
  item({id:'legacy-fee-rate',title:'Curve platform fee',holder:PLATFORM_SETTINGS.admin,controls:'Fee taken on every curve trade before graduation. Existing curves read the current value.',canMoveFunds:true,scope:'Curves not yet graduated',account:platformId,field:'PlatformConfig.feeRate (per 1,000,000)',expected:POLICY.platformRate,observed:pf('platformRate'),status:compare(pf('platformRate'),POLICY.platformRate)}),
  item({id:'legacy-creator-fee',title:'Curve creator fee',holder:PLATFORM_SETTINGS.admin,controls:'Creator share of each curve trade.',canMoveFunds:true,scope:'Curves not yet graduated',account:platformId,field:'PlatformConfig.creatorFeeRate (per 1,000,000)',expected:POLICY.creatorRate,observed:pf('creatorRate'),status:compare(pf('creatorRate'),POLICY.creatorRate)}),
  item({id:'legacy-cp-creator',title:'CPMM creator assigned at graduation',holder:PLATFORM_SETTINGS.admin,controls:'If set, becomes the creator of every pool created at graduation and receives its 1% creator fee instead of the token creator. Unset means the token creator keeps it. Read when each curve graduates.',canMoveFunds:true,scope:'Every curve that graduates later',account:platformId,field:'PlatformConfig.platformCpCreator',expected:ZERO,observed:pf('cpCreator'),status:compare(pf('cpCreator'),ZERO)}),
  item({id:'legacy-transfer-auth',title:'Tax authority given to new launches',holder:pf('transferAuthority'),controls:'Becomes each new launch\'s tax-withdrawal authority, and the tax-rate authority when a launch graduates. The admin can change this field after launch to redirect the tax-rate authority assigned to existing curves at graduation; their existing withdrawal authority stays unchanged.',canMoveFunds:true,scope:'New launches and existing curves at graduation',account:platformId,field:'PlatformConfig.transferFeeExtensionAuth',expected:PLATFORM_SETTINGS.transferAuthority,observed:pf('transferAuthority'),status:compare(pf('transferAuthority'),PLATFORM_SETTINGS.transferAuthority),note:'Verified in V2 using mainnet program binaries in a local fork: migration reads this field at graduation. No mainnet transaction was sent.'}),
  item({id:'legacy-claim',title:'Platform fee claim wallet',holder:pf('feeWallet'),controls:'Claims accrued curve platform fees for every pool on the platform.',canMoveFunds:true,scope:'All legacy curves',account:platformId,field:'PlatformConfig.platformClaimFeeWallet',expected:PLATFORM_SETTINGS.claimAuthority,observed:pf('feeWallet'),status:compare(pf('feeWallet'),PLATFORM_SETTINGS.claimAuthority)}),
  item({id:'legacy-fee-key',title:'Lock-NFT (fee key) wallet',holder:pf('lockNftWallet'),controls:'Receives the locked-liquidity fee key of each curve that graduates.',canMoveFunds:true,scope:'Every curve that graduates later',account:platformId,field:'PlatformConfig.platformLockNftWallet',expected:PLATFORM_SETTINGS.feeKeyWallet,observed:pf('lockNftWallet'),status:compare(pf('lockNftWallet'),PLATFORM_SETTINGS.feeKeyWallet)}),
  item({id:'legacy-rule-manager',title:'Delegated rule manager',holder:pf('ruleManager')===ZERO?null:pf('ruleManager'),controls:'If set, can edit launch curve rules without the admin.',canMoveFunds:false,scope:'Future launches',account:platformId,field:'PlatformConfig.curveRuleManager',expected:ZERO,observed:pf('ruleManager'),status:compare(pf('ruleManager'),ZERO)}),
 ];
 // ── Future launches ────────────────────────────────────────────────────────────
 const future=[
  item({id:'admission-wxmr',title:'Public wXMR launch admission',holder:PLATFORM_SETTINGS.admin,controls:'While open, any wallet can launch under Grainpad on chain within the curve rules. The admin can close or reopen it at once.',canMoveFunds:false,scope:'Future launches',account:wxmrAllow,field:'Allow-config account exists',observed:allowState(wxmrAllow),status:compare(allowState(wxmrAllow),undefined),note:allowState(wxmrAllow)?`Admission is ${allowState(wxmrAllow)}.`:null}),
  item({id:'admission-sol',title:'SOL launch admission',holder:PLATFORM_SETTINGS.admin,controls:'Untaxed SOL launches are not part of the current rules.',canMoveFunds:false,scope:'Future launches',account:solAllow,field:'Allow-config account exists',expected:'closed',observed:allowState(solAllow),status:compare(allowState(solAllow),'closed')}),
  item({id:'new-platform',title:'Replacement platform under multisig governance',controls:'Planned: a new platform whose admin is a multisig with independent members and a public delay. It has not been created.',canMoveFunds:false,scope:'Future launches',status:'declared',note:'Not created. Until it exists, future launches use the legacy platform above.'}),
 ];
 // ── Off-chain and custody (declared) ──────────────────────────────────────────
 const operations=[
  item({id:'ops-custody',title:'Withdrawn tax and pending rewards',holder:REWARDS_DEPLOYMENT.collector,controls:'After withdrawal, tax, converted wXMR, unpaid holder credits and the GRAIN burn reserve sit in collector-controlled accounts until paid. Any future withdrawal multisig does not by itself limit funds already held here.',canMoveFunds:true,scope:'All rewards',status:'declared',note:'Custodial today. Balances are visible on chain at the collector address.'}),
  item({id:'ops-entitlements',title:'Who is owed what',controls:'Holder snapshots, exclusions, the 70/15/15 split and payout timing are computed off chain by the Grainpad operator and published as signed receipts. A smart contract does not enforce them.',canMoveFunds:true,scope:'All rewards',status:'declared'}),
  item({id:'ops-payout-burn',title:'Payout, conversion and GRAIN burn signer',holder:REWARDS_DEPLOYMENT.collector,controls:'Signs conversions, holder payouts and buy-and-burn transactions.',canMoveFunds:true,scope:'All rewards',status:'declared'}),
  item({id:'ops-treasury',title:'Platform revenue recipient',holder:PLATFORM_SETTINGS.revenueRecipient,controls:'Receives the platform\'s 15% share and forwarded platform fees.',canMoveFunds:true,scope:'Platform revenue',status:'declared',note:'Currently the same key as the legacy admin.'}),
  item({id:'ops-deploy',title:'Website and transaction builders',controls:'Grainpad deploys the site that prepares the transactions you sign. The deployed source commit is shown in the footer and at /api/version; that alone does not prove the served build matches it.',canMoveFunds:true,scope:'Everyone using grainpad.fun',status:'declared',note:'Always review the transaction in your wallet before signing.'}),
  item({id:'ops-metadata',title:'Hosted metadata and images',controls:'Token metadata URIs point to Grainpad hosting. Content hashes are committed so changes are detectable, not preventable.',canMoveFunds:false,scope:'Display',status:'declared'}),
 ];
 // ── Third parties ─────────────────────────────────────────────────────────────
 const wxmr=get(QUOTES.wXMR.mint)===undefined?undefined:decodeLedgerMint(QUOTES.wXMR.mint,get(QUOTES.wXMR.mint));
 const thirdParty=[
  ...WATCHED_PROGRAMS.map(p=>{const pd=read?.programData?.[p.id],authority=onChain&&pd!==undefined?programUpgradeAuthority(pd):undefined;
   return item({id:`program-${p.id}`,title:`${p.name} upgrade authority`,holder:authority,controls:`${p.role}. The upgrade authority can replace this program's code.`,canMoveFunds:true,scope:'Everything that uses this program',account:p.id,field:'ProgramData upgrade authority',observed:authority,status:compare(authority,undefined),note:authority===null?'Immutable: no upgrade authority.':null});}),
  item({id:'wxmr-mint',title:'wXMR mint authority',holder:wxmr?wxmr.mintAuthority:undefined,controls:'The wXMR issuer can create new wXMR. Every Grainpad pool, payout and burn is priced in wXMR.',canMoveFunds:true,scope:'All Grainpad markets',account:QUOTES.wXMR.mint,field:'Mint.mintAuthority',observed:wxmr?.mintAuthority,status:compare(wxmr?wxmr.mintAuthority:undefined,undefined)}),
  item({id:'wxmr-freeze',title:'wXMR freeze authority',holder:wxmr?wxmr.freezeAuthority:undefined,controls:'Could freeze any wXMR account, including pool vaults and payout wallets.',canMoveFunds:true,scope:'All Grainpad markets',account:QUOTES.wXMR.mint,field:'Mint.freezeAuthority',observed:wxmr?.freezeAuthority,status:compare(wxmr?wxmr.freezeAuthority:undefined,undefined)}),
  item({id:'wxmr-bridge',title:'wXMR bridge and XMR backing',controls:'wxmr.io operates the bridge, holds the XMR backing and handles redemption. Grainpad does not verify the backing.',canMoveFunds:true,scope:'All Grainpad markets',status:'declared'}),
  item({id:'raydium-keeper',title:'Raydium migration keeper',controls:'Graduation is executed by a Raydium-operated keeper. A completed curve waits until it runs.',canMoveFunds:false,scope:'Graduation',status:'declared'}),
 ];
 const sections=[
  {id:'grain',title:'Official GRAIN',summary:'GRAIN has its own authorities. The legacy platform admin no longer controls GRAIN after graduation.',items:grain},
  {id:'existing',title:'Existing curves on the legacy platform',summary:'Launches created under the founder-administered platform. The platform admin keeps control over them until each graduates.',items:legacy,curves,curveDiscovery:read?.curveDiscovery??{source:'unknown',complete:false}},
  {id:'future',title:'Future launches',summary:'Who decides what new launches look like.',items:future},
  {id:'operations',title:'Off-chain control and custody',summary:'Grainpad statements about control that a chain read cannot show.',items:operations},
  {id:'third-party',title:'Outside Grainpad\'s control',summary:'Dependencies Grainpad cannot change.',items:thirdParty},
 ];
 const all=sections.flatMap(s=>s.items);
 return {schema:LEDGER_SCHEMA,network:'mainnet-beta',genesisVerified:onChain,observedAt:read?.observedAt??null,slot:read?.slot??null,epoch:read?.epoch??null,source:read?.source??null,
  counts:Object.fromEntries(['matches-published','differs','observed','unavailable','declared'].map(s=>[s,all.filter(i=>i.status===s).length])),
  warnings:[...warnings,...all.filter(i=>i.status==='differs').map(i=>`${i.title}: observed value differs from the published setting.`)],sections};
}

/** Addresses the server must read for one ledger, in order. Program data addresses come from a second read. */
export function ledgerAccountKeys(curves=[]){
 const platformId=String(grainpadPlatformId());
 return [...new Set([platformId,...expectedRuleAccounts(grainpadPlatformId()).map(String),GRAIN_FEE_FREEZE_POLICY.mint,GRAIN_FEE_FREEZE_POLICY.pool,QUOTES.wXMR.mint,...WATCHED_PROGRAMS.map(p=>p.id),...curves.flatMap(c=>[c.mint,c.pool])])];
}


