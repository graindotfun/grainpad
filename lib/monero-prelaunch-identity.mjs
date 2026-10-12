/** Browser-safe canonical mint-ownership proof; this is not a wallet spending message. */
import {PublicKey} from '@solana/web3.js';
export function mintProvenanceProofMessage({mint,creator,metadataHash,platformId}){
 for(const value of [mint,creator,platformId])if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw Error('Canonical planned address required.');
 if(typeof metadataHash!=='string'||!/^[a-f0-9]{64}$/.test(metadataHash))throw Error('Canonical planned metadata hash required.');
 return new TextEncoder().encode(['GRAINPAD MINT CONTROL FOR PROVENANCE V1','Domain: grainpad.fun','Network: mainnet-beta',`Mint: ${mint}`,`Creator: ${creator}`,`Metadata SHA-256: ${metadataHash}`,`Platform: ${platformId}`,'No transfer, delegation, or financial approval.'].join('\n'));
}
