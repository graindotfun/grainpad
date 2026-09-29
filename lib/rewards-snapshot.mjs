import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint,unpackAccount,getTransferFeeConfig,getTransferFeeAmount} from '@solana/spl-token';
import {REWARDS_POLICY} from './rewards-policy.mjs';

export function inspectRewardMint(mint,account,collector) {
  if (!account?.owner.equals(TOKEN_2022_PROGRAM_ID)) throw Error('A Token-2022 rewards mint is required.');
  const token=unpackMint(mint,account,TOKEN_2022_PROGRAM_ID),fee=getTransferFeeConfig(token);
  if (!fee || !fee.withdrawWithheldAuthority.equals(collector)) throw Error('Rewards collector authority mismatch.');
  if (token.decimals!==6 || token.mintAuthority || token.freezeAuthority) throw Error('Rewards mint authority or decimals mismatch.');
  if (![fee.olderTransferFee,fee.newerTransferFee].every(f=>REWARDS_POLICY.transferFeeBps.includes(f.transferFeeBasisPoints))) throw Error('Unsupported current or scheduled transfer tax.');
  return {token,fee};
}

/** Fail closed when live movement makes a complete supply reconciliation impossible. */
export async function readRewardSnapshot(connection,{mint,collector,excludedOwners=[]}) {
  const before=await connection.getAccountInfoAndContext(mint,{commitment:'finalized'});
  inspectRewardMint(mint,before.value,collector);
  const scan=await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID,{commitment:'finalized',withContext:true,
    minContextSlot:before.context.slot,filters:[{memcmp:{offset:0,bytes:String(mint)}}]});
  if (!scan?.context || !Array.isArray(scan.value)) throw Error('A complete contextual token-account scan is required.');
  const after=await connection.getAccountInfoAndContext(mint,{commitment:'finalized',minContextSlot:scan.context.slot});
  const {token,fee}=inspectRewardMint(mint,after.value,collector);
  let accounted=fee.withheldAmount;
  const seen=new Set(),holders=[],harvestAccounts=[];
  const excluded=new Set([String(collector),'1nc1nerator11111111111111111111111111111111',...excludedOwners]);
  for (const {pubkey,account} of scan.value) {
    if (seen.has(String(pubkey))) throw Error('Duplicate account in holder scan.');
    seen.add(String(pubkey));
    const a=unpackAccount(pubkey,account,TOKEN_2022_PROGRAM_ID);
    if (!a.mint.equals(mint) || !a.isInitialized) throw Error('Invalid holder token account.');
    const withheld=getTransferFeeAmount(a)?.withheldAmount||0n;
    accounted+=a.amount+withheld;
    if (withheld>0n) harvestAccounts.push(String(pubkey));
    if (!PublicKey.isOnCurve(a.owner.toBytes())) excluded.add(String(a.owner));
    holders.push({owner:String(a.owner),amountRaw:String(a.amount)});
  }
  if (accounted!==token.supply) throw Error('Holder scan does not reconcile to total supply; retry a fresh finalized snapshot.');
  return {mint:String(mint),slot:scan.context.slot,mintReadSlot:after.context.slot,commitment:'finalized',
    supplyRaw:String(token.supply),accountedSupplyRaw:String(accounted),holders,harvestAccounts,
    excludedOwners:[...excluded].sort(),
    exclusionPolicy:'Collector, incinerator, explicitly listed owners, and program-owned wallets (including pool vaults) are excluded. Custodial/program positions do not receive direct payouts.'};
}
