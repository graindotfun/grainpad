import {protectedProgramAddresses,protectedProgramCommitment} from './protected-launch-program.mjs';
/** Called only with the server's finalized escrow snapshot. Keeps the existing
 * pool, mint, rewards and immutable metadata verification intact. */
export function protectedRegistrationIdentity(snapshot,{mint,programId}){
 const l=snapshot?.launch;if(!l||l.state!==1||BigInt(l.spentRaw)<=0n||BigInt(l.receivedRaw)<=0n)throw Error('Protected launch has not finalized settlement.');
 const a=protectedProgramAddresses({creator:l.creator,nonce:l.nonce,programId});
 if(String(a.mint)!==mint||l.mint!==mint||snapshot.addresses?.launch!==String(a.launch)||snapshot.addresses?.program!==programId||l.quoteVault!==String(a.quoteVault)||l.commitment!==protectedProgramCommitment(l.terms))throw Error('Protected registration PDA proof differs.');
 return {programId,creator:l.creator,nonce:l.nonce,launch:String(a.launch),mint,metadataHash:l.terms.metadataHash,uri:l.terms.uri,name:l.terms.name,symbol:l.terms.symbol,commitment:l.commitment};
}
