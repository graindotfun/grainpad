import './browser-buffer.mjs';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,unpackAccount} from '@solana/spl-token';
import {SITE} from './site-config';
import {grainpadPlatformId} from './platform-policy';
import {rpc,assertNetwork} from './launch';
import {prepareInstructions} from './operations';
import {feeVaults,feeClaimInstructions} from './fee-instructions.mjs';
export async function readFees(ownerAddress:string,symbol='SOL'){
 const connection=rpc('mainnet-beta'),owner=new PublicKey(ownerAddress);await assertNetwork(connection,'mainnet-beta');
 const a=feeVaults(owner,grainpadPlatformId(),symbol),accounts=await connection.getMultipleAccountsInfo([a.creator,a.platform]);
 const amount=(index:number)=>{const info=accounts[index];if(!info)return '0';const token=unpackAccount(index===0?a.creator:a.platform,info,TOKEN_PROGRAM_ID);if(!token.mint.equals(a.mint))throw Error('Unexpected fee currency.');return token.amount.toString();};
 return {creator:amount(0),platform:ownerAddress===SITE.projectWallet?amount(1):'0',quote:a.quote};
}
export async function prepareFeeClaim(ownerAddress:string,kind:'creator'|'platform',maxCost:string,symbol='SOL'){
 const rewards=await readFees(ownerAddress,symbol),amount=rewards[kind];if(BigInt(amount)<=0n)throw Error('No accrued fees to claim.');
 if(kind==='platform'&&ownerAddress!==SITE.projectWallet)throw Error('Platform fees belong to the Grainpad owner wallet.');
 const owner=new PublicKey(ownerAddress),a=feeVaults(owner,grainpadPlatformId(),symbol);
 const prepared=await prepareInstructions(ownerAddress,feeClaimInstructions(owner,grainpadPlatformId(),kind,symbol),maxCost);
 return {...prepared,amount,kind,destination:a.destination.toBase58(),quote:a.quote};
}
