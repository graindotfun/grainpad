/** Atomic public wXMR admission + official create + declared creator buy. No wallet or submission. */
import {PublicKey} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction,getAssociatedTokenAddressSync} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {buildRewardsLaunch,rewardsAddresses} from './rewards-launch.mjs';
import {QUOTES} from './quote-assets.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY,OFFICIAL_LAUNCH_CREATOR,OFFICIAL_LOOKUP_EXTENSION_ADDRESSES,OFFICIAL_LOOKUP_TABLE} from './official-launch-policy.mjs';
import {lookupAccount} from './sol-route-lookup.mjs';
const b=value=>new BN(String(value));
export function officialAtomicInstructions({mint,name='Grainpad',symbol='GRAIN',uri,taxBps,admin=new PublicKey(PLATFORM_SETTINGS.admin),creator=new PublicKey(OFFICIAL_LAUNCH_CREATOR),platform=grainpadPlatformId(),creatorBuy=OFFICIAL_DECLARED_CREATOR_BUY}={}){
 if(name!=='Grainpad'||symbol!=='GRAIN')throw Error('Official launch identity must be Grainpad / GRAIN.');
 if(creatorBuy?.quote!=='wXMR'||creatorBuy.amountIn!==OFFICIAL_DECLARED_CREATOR_BUY.amountIn||creatorBuy.minOut!==OFFICIAL_DECLARED_CREATOR_BUY.minOut)throw Error('Declared creator buy does not match the approved pin.');
 const mintKey=mint instanceof PublicKey?mint:new PublicKey(mint);
 const adminKey=admin instanceof PublicKey?admin:new PublicKey(admin);
 const creatorKey=creator instanceof PublicKey?creator:new PublicKey(creator);
 if(adminKey.equals(creatorKey))throw Error('Official relaunch creator must be a different wallet from the platform admin.');
 const a=rewardsAddresses(platform),quote=new PublicKey(QUOTES.wXMR.mint);
 const launch=buildRewardsLaunch({owner:creatorKey,payer:creatorKey,mint:mintKey,platform,name,symbol,uri,taxBps});
 const vaultA=sdk.getPdaLaunchpadVaultId(sdk.LAUNCHPAD_PROGRAM,launch.pool,mintKey).publicKey;
 const vaultB=sdk.getPdaLaunchpadVaultId(sdk.LAUNCHPAD_PROGRAM,launch.pool,quote).publicKey;
 const grainAta=getAssociatedTokenAddressSync(mintKey,creatorKey,false,TOKEN_2022_PROGRAM_ID);
 const wxmrAta=getAssociatedTokenAddressSync(quote,creatorKey,false,TOKEN_PROGRAM_ID);
 const buy=sdk.buyExactInInstruction(sdk.LAUNCHPAD_PROGRAM,creatorKey,sdk.getPdaLaunchpadAuth(sdk.LAUNCHPAD_PROGRAM).publicKey,a.config,platform,launch.pool,grainAta,wxmrAta,vaultA,vaultB,mintKey,quote,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,sdk.getPdaPlatformVault(sdk.LAUNCHPAD_PROGRAM,platform,quote).publicKey,sdk.getPdaCreatorVault(sdk.LAUNCHPAD_PROGRAM,creatorKey,quote).publicKey,b(creatorBuy.amountIn),b(creatorBuy.minOut),b(0));
 return {admin:adminKey,creator:creatorKey,mint:mintKey,pool:launch.pool,allow:a.allow,quoteMint:launch.quoteMint,grainAta,wxmrAta,vaultA,vaultB,creatorBuy,instructions:[
  sdk.createPlatformAllowConfigIns(sdk.LAUNCHPAD_PROGRAM,adminKey,platform,a.config,a.allow),
  launch.instruction,
  createAssociatedTokenAccountIdempotentInstruction(creatorKey,grainAta,creatorKey,mintKey,TOKEN_2022_PROGRAM_ID),
  buy,
 ]};
}
/** Test and size fixture. Production preparation loads the real table and refuses a short one. */
export function fixtureLaunchLookup(plan,{authority=PLATFORM_SETTINGS.admin}={}){
 const keep=new Set([PLATFORM_SETTINGS.admin,OFFICIAL_LAUNCH_CREATOR,String(plan.admin??''),String(plan.creator??''),String(plan.mint),String(plan.pool),String(plan.grainAta),String(plan.vaultA),String(plan.vaultB)]);
 const addresses=new Set(OFFICIAL_LOOKUP_EXTENSION_ADDRESSES);
 for(const ix of plan.instructions){addresses.add(ix.programId.toBase58());for(const key of ix.keys)addresses.add(key.pubkey.toBase58());}
 for(const key of keep)addresses.delete(key);
 addresses.add(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
 return lookupAccount(OFFICIAL_LOOKUP_TABLE,[...addresses],{authority});
}
