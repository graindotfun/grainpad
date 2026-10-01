/** Lighthouse assertion codec pinned to upstream 4c579479c98635e419b1b167f08be02a71604a71.
 * ABI/source provenance for the live deployment must be verified before enabling. */
import {Buffer} from 'buffer';import {PublicKey,TransactionInstruction} from '@solana/web3.js';
export const LIGHTHOUSE_NET_GUARD_PROGRAM='L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
// Operational identity/codec behavior review for this target, not a source-to-binary build claim.
export const LIGHTHOUSE_NET_GUARD_DEPLOYMENT_VERIFIED=true;
export const LIGHTHOUSE_NET_GUARD_SOURCE='4c579479c98635e419b1b167f08be02a71604a71';
export function netTokenMinimumGuard(outputAccount,minimum){
 if(typeof minimum!=='string'||!/^\d+$/.test(minimum))throw Error('Net token minimum must be an unsigned integer string.');
 const amount=BigInt(minimum);if(amount<1n||amount>18446744073709551615n)throw Error('Net token minimum is outside u64 bounds.');
 // Borsh: instruction AssertTokenAccount=9, log Silent=0,
 // TokenAccountAssertion::Amount=2, value:u64, IntegerOperator::GreaterThanOrEqual=4.
 const data=Buffer.alloc(12);data[0]=9;data[1]=0;data[2]=2;data.writeBigUInt64LE(amount,3);data[11]=4;
 return new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_NET_GUARD_PROGRAM),keys:[{pubkey:new PublicKey(outputAccount),isSigner:false,isWritable:false}],data});
}

/** Exact execution-time baseline guard; zero balances are supported. */
export function tokenBalanceEqualityGuard(account,value){
 if(typeof value!=='string'||!/^\d+$/.test(value)||BigInt(value)>18446744073709551615n)throw Error('Token baseline is outside u64 bounds.');
 const data=Buffer.alloc(12);data[0]=9;data[1]=0;data[2]=2;data.writeBigUInt64LE(BigInt(value),3);data[11]=0;
 return new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_NET_GUARD_PROGRAM),keys:[{pubkey:new PublicKey(account),isSigner:false,isWritable:false}],data});
}
/** Immutable route balance guards. A changed existing-token baseline aborts execution.
 *
 * WSOL is always created non-idempotently earlier in the same transaction and closed
 * after the swap. The exact lamport transfer fixes its input and the close instruction
 * already fails unless its token balance is zero. Duplicating those two facts as
 * Lighthouse assertions consumes scarce packet space and can leave no room for a
 * wallet's own transaction assertions. */
export function buildSolBalanceGuards({side,baseAccount,wsolAccount,baseline,amount,minimum,baseExists}){
 if(!['buy','sell'].includes(side)||typeof baseline!=='string'||!/^\d+$/.test(baseline))throw Error('Invalid token balance guard terms.');
 const before=BigInt(baseline),input=BigInt(amount),output=BigInt(minimum);
 if(input<1n||output<1n||(side==='sell'&&(!baseExists||before<input)))throw Error('Insufficient guarded token baseline.');
 const pre=baseExists?[tokenBalanceEqualityGuard(baseAccount,String(before))]:[];
 const post=side==='buy'?[netTokenMinimumGuard(baseAccount,String(before+output))]:[tokenBalanceEqualityGuard(baseAccount,String(before-input)),netTokenMinimumGuard(wsolAccount,String(output))];
 return {pre,post};
}
