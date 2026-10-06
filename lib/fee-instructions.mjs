import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {quoteAsset} from './quote-assets.mjs';
export function feeVaults(owner,platform,symbol='SOL'){const quote=quoteAsset(symbol),mint=new PublicKey(quote.mint);return {quote,mint,creator:sdk.getPdaCreatorVault(sdk.LAUNCHPAD_PROGRAM,owner,mint).publicKey,platform:sdk.getPdaPlatformVault(sdk.LAUNCHPAD_PROGRAM,platform,mint).publicKey,destination:getAssociatedTokenAddressSync(mint,owner)};}
export function feeClaimInstruction(owner,platform,kind,symbol='SOL'){const a=feeVaults(owner,platform,symbol);if(kind==='creator')return sdk.claimCreatorFee(sdk.LAUNCHPAD_PROGRAM,owner,sdk.getPdaCreatorFeeVaultAuth(sdk.LAUNCHPAD_PROGRAM).publicKey,a.creator,a.destination,a.mint,TOKEN_PROGRAM_ID);if(kind==='platform')return sdk.claimPlatformFeeFromVault(sdk.LAUNCHPAD_PROGRAM,platform,owner,sdk.getPdaPlatformFeeVaultAuth(sdk.LAUNCHPAD_PROGRAM).publicKey,a.platform,a.destination,a.mint,TOKEN_PROGRAM_ID);throw Error('Invalid fee claim type.');}

/** Destination creation is idempotent; first-time claimants need not fund the ATA in a separate transaction. */
export function feeClaimInstructions(owner,platform,kind,symbol='SOL'){
 const a=feeVaults(owner,platform,symbol);
 return [createAssociatedTokenAccountIdempotentInstruction(owner,a.destination,owner,a.mint),feeClaimInstruction(owner,platform,kind,symbol)];
}
