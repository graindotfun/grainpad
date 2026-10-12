import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {sha256} from '@noble/hashes/sha256';
/** The executable pin applies to financial preparation AND finalized identity
 * registration; a program upgrade cannot quietly retain the old approval. */
export async function assertProtectedExecutable(connection,pins,commitment='confirmed'){
 const account=await connection.getAccountInfo(new PublicKey(pins.programId),commitment);
 if(!account?.executable||String(account.owner)!=='BPFLoaderUpgradeab1e11111111111111111111111'||account.data.length!==36||account.data.readUInt32LE(0)!==2)throw Error('Verified Protected Launch executable is unavailable.');
 const data=await connection.getAccountInfo(new PublicKey(account.data.subarray(4,36)),commitment);
 if(!data||!data.owner.equals(account.owner)||data.data.length<45||data.data.readUInt32LE(0)!==3||Buffer.from(sha256(data.data.subarray(45))).toString('hex')!==pins.executableSha256)throw Error('Protected executable differs from the reviewed deployment.');
}
