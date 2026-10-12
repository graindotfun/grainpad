import {LAUNCHPAD_PROGRAM,getPdaLaunchpadAuth} from '@raydium-io/raydium-sdk-v2';
import {TOKEN_2022_PROGRAM_ID,unpackMint,getMetadataPointerState,getTokenMetadata} from '@solana/spl-token';
/** Read metadata embedded in the same finalized mint account; no second RPC. */
export async function rewardMintMetadata(mint,account){
 const token=unpackMint(mint,account,TOKEN_2022_PROGRAM_ID),pointer=getMetadataPointerState(token);
 if(!pointer?.metadataAddress?.equals(mint)||pointer.authority)throw Error('Rewards metadata must be embedded in the mint with a fixed pointer.');
 const metadata=await getTokenMetadata({getAccountInfo:async()=>account},mint,'finalized',TOKEN_2022_PROGRAM_ID);
 if(!metadata?.mint.equals(mint)||(metadata.updateAuthority&&!metadata.updateAuthority.equals(getPdaLaunchpadAuth(LAUNCHPAD_PROGRAM).publicKey)))throw Error('Rewards metadata authority must be revoked or controlled by LaunchLab.');
 return metadata;
}
