/** Offline verification only: no RPC, publication, wallet or chain write. */
import {readFile,stat} from 'node:fs/promises';
import {decodeImageArchive,verifiedImageBytes,IMAGE_ARCHIVE_LIMIT} from '../lib/launch-image-archive.mjs';
import {verifyImageMetadataBinding} from '../lib/launch-image-binding.ts';
import {verifiedCatalogProof} from '../lib/verified-monero-catalog.mjs';
export async function verifyLaunchImageArchive(bundle){
 const {network,token,launchIdentity:launch,moneroEvidence:proof}=bundle;
 if(!launch||!proof)throw Error('Launch and Monero evidence are required.');
 const row={network,mint:token,platform_id:network==='mainnet-beta'?launch.platformId:launch.factory,creator:launch.creator,pool:network==='mainnet-beta'?launch.pool:launch.launchId,launch,proof};
 // Verify the saved observation at its stated time. An offline file cannot prove
 // current daemon state, source-chain finality or future storage availability.
 if(!verifiedCatalogProof(row,proof.observed_at))throw Error('Saved Monero evidence does not verify for this launch.');
 const decoded=decodeImageArchive(new TextEncoder().encode(JSON.stringify(bundle)),network,token);
 const {document,metadataHash}=await verifyImageMetadataBinding(network,token,launch,proof,decoded.metadataBytes);
 const image=await verifiedImageBytes(null,document,decoded.imageBytes);
 if(bundle.metadataHash!==metadataHash||bundle.imageSha256!==image.sha256)throw Error('Archive summary differs from its original bytes.');
 return {imageMetadataBindingVerified:true,moneroInclusionVerified:false,sourceChainFinalityVerified:false,observationSource:'untrusted supplied snapshot',network,token,imageSha256:image.sha256,imageBytes:image.bytes.length,metadataHash,moneroTransaction:proof.tx_hash,observationTime:proof.observed_at,note:'Image and metadata byte bindings and record encoding/signature verified offline. Supplied transaction, confirmation and observation fields are unauthenticated claims; Monero inclusion and source-chain finality require independent online verification.'};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const [path,...extra]=process.argv.slice(2);if(!path||extra.length)throw Error('Usage: node scripts/verify-launch-image-archive.mjs archive.json');
 if((await stat(path)).size>IMAGE_ARCHIVE_LIMIT+100_000)throw Error('Archive is too large.');
 console.log(JSON.stringify(await verifyLaunchImageArchive(JSON.parse(await readFile(path,'utf8'))),null,2));
}
