/** DP-9 preparation only. No signer, relay or mutation RPC.
 * Observations are short-lived review candidates, never execution authority. */
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint,getTransferFeeConfig,AuthorityType,createSetAuthorityInstruction} from '@solana/spl-token';
import {rewardsDigest} from './rewards-allocation.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
export function validateTransferFeeRevokeState({mint,program,authority,epoch,newerTransferFee},expected){
 if(!expected||String(new PublicKey(expected.mint))!==mint||program!==String(TOKEN_2022_PROGRAM_ID)||authority!==expected.authority||!authority||new PublicKey(authority).equals(PublicKey.default)||String(new PublicKey(authority))!==authority)throw Error('Exact mint, Token-2022 program and current authority required.');
 if(!Number.isSafeInteger(epoch)||epoch<0||!newerTransferFee||!Number.isInteger(expected.basisPoints)||expected.basisPoints<0||expected.basisPoints>10000||typeof expected.maximumFee!=='string'||!/^\d+$/.test(expected.maximumFee)||BigInt(expected.maximumFee)>((1n<<64n)-1n))throw Error('Exact reviewed epoch and immutable fee policy required.');
 if(BigInt(newerTransferFee.epoch)>BigInt(epoch))throw Error('Future scheduled fee survives revocation; refuse revoke.');
 if(newerTransferFee.transferFeeBasisPoints!==expected.basisPoints||String(newerTransferFee.maximumFee)!==expected.maximumFee)throw Error('Effective fee differs from intended immutable rate or maximum.');
 return true;
}
export async function observeTransferFeeRevokeCandidate(connection,expected,{clock=Date.now}={}){
 if(await connection.getGenesisHash()!==MAINNET)throw Error('Finalized mainnet observation required.');
 const before=await connection.getEpochInfo('finalized'),mint=new PublicKey(expected.mint);
 const observed=await connection.getAccountInfoAndContext(mint,{commitment:'finalized',minContextSlot:before.absoluteSlot});
 if(!observed.value||!Number.isSafeInteger(observed.context.slot)||observed.context.slot<before.absoluteSlot)throw Error('Exact finalized mint read required.');
 const token=unpackMint(mint,observed.value,TOKEN_2022_PROGRAM_ID),fee=getTransferFeeConfig(token);
 const after=await connection.getEpochInfo({commitment:'finalized',minContextSlot:observed.context.slot});
 if(before.epoch!==after.epoch||after.absoluteSlot<observed.context.slot)throw Error('Epoch changed during review; observe again.');
 const candidate={mint:String(mint),program:String(observed.value.owner),authority:fee?.transferFeeConfigAuthority&&!fee.transferFeeConfigAuthority.equals(PublicKey.default)?String(fee.transferFeeConfigAuthority):null,epoch:after.epoch,newerTransferFee:fee?{epoch:String(fee.newerTransferFee.epoch),maximumFee:String(fee.newerTransferFee.maximumFee),transferFeeBasisPoints:fee.newerTransferFee.transferFeeBasisPoints}:null,slot:observed.context.slot,observedAt:clock(),accountFingerprint:rewardsDigest({owner:String(observed.value.owner),data:Buffer.from(observed.value.data).toString('base64')}),expected:structuredClone(expected)};
 validateTransferFeeRevokeState(candidate,expected);Object.freeze(candidate.expected);if(candidate.newerTransferFee)Object.freeze(candidate.newerTransferFee);Object.freeze(candidate);proofs.set(candidate,rewardsDigest(candidate));return candidate;
}
export function prepareTransferFeeRevokeInstruction(candidate,{now=Date.now()}={}){
 if(proofs.get(candidate)!==rewardsDigest(candidate)||!Number.isSafeInteger(now)||now<candidate.observedAt||now-candidate.observedAt>30000)throw Error('Fresh unchanged opaque review candidate required.');
 validateTransferFeeRevokeState(candidate,candidate.expected);
 return createSetAuthorityInstruction(new PublicKey(candidate.mint),new PublicKey(candidate.authority),AuthorityType.TransferFeeConfig,null,[],TOKEN_2022_PROGRAM_ID);
}
