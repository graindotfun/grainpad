import './browser-buffer.mjs';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,getAccount,getMint} from '@solana/spl-token';
import BN from 'bn.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
export async function graduatedClaimInstructions(connection,market,owner,kind,feeKey){
 const p=market.cpData;
 if(![p.mintProgramA,p.mintProgramB].every(program=>program?.equals(TOKEN_PROGRAM_ID)||program?.equals(TOKEN_2022_PROGRAM_ID)))throw Error('Unsupported fee token program.');
 const ataA=getAssociatedTokenAddressSync(p.mintA,owner,false,p.mintProgramA),ataB=getAssociatedTokenAddressSync(p.mintB,owner,false,p.mintProgramB);
 const instructions=[createAssociatedTokenAccountIdempotentInstruction(owner,ataA,owner,p.mintA,p.mintProgramA),createAssociatedTokenAccountIdempotentInstruction(owner,ataB,owner,p.mintB,p.mintProgramB)];
 if(kind==='creator'){
  if(!p.poolCreator.equals(owner))throw Error('Connect the original token creator wallet.');
  if(p.creatorFeesMintA.isZero()&&p.creatorFeesMintB.isZero())throw Error('No post-graduation creator fees have accrued.');
  instructions.push(sdk.makeCollectCreatorFeeInstruction(sdk.CREATE_CPMM_POOL_PROGRAM,owner,sdk.CREATE_CPMM_POOL_AUTH,market.poolId,p.configId,p.vaultA,p.vaultB,p.mintA,p.mintB,ataA,ataB,p.mintProgramA,p.mintProgramB));
 }else{
  const nft=new PublicKey(feeKey),nftAta=getAssociatedTokenAddressSync(nft,owner),position=await getAccount(connection,nftAta),nftMint=await getMint(connection,nft);
  if(position.amount!==1n||nftMint.decimals!==0||nftMint.supply!==1n)throw Error('Your wallet does not hold this Fee Key NFT.');
  const lock=sdk.getCpLockPda(sdk.LOCK_CPMM_PROGRAM,nft).publicKey,lockAcc=await connection.getAccountInfo(lock);if(!lockAcc?.owner.equals(sdk.LOCK_CPMM_PROGRAM))throw Error('Unrecognized locked-liquidity position.');
  const lockVault=getAssociatedTokenAddressSync(p.mintLp,sdk.LOCK_CPMM_AUTH,true),locked=await getAccount(connection,lockVault);
  // LP-Lock caps this upper bound to fees available for the validated Fee Key; never releases its principal.
  instructions.push(sdk.collectCpFeeInstruction({programId:sdk.LOCK_CPMM_PROGRAM,auth:sdk.LOCK_CPMM_AUTH,nftOwner:owner,nftMint:nft,nftAccount:nftAta,lockPda:lock,poolId:market.poolId,mintLp:p.mintLp,userVaultA:ataA,userVaultB:ataB,poolVaultA:p.vaultA,poolVaultB:p.vaultB,mintA:p.mintA,mintB:p.mintB,lockLpVault:lockVault,lpFeeAmount:new BN(locked.amount.toString())}));
 }
 return {instructions,p,ataA,ataB};
}
