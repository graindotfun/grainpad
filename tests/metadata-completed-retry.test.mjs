import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMetadataPublication,contentHash} from '../lib/metadata-publication.mjs';
import {completedMetadataRetry} from '../lib/metadata-completed-retry.mjs';
const encode=value=>new TextEncoder().encode(value);
async function fixture(){
 const mint='CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn',owner='owner-test-bound-by-route',image=encode('Synthetic image bytes; route image validation is tested separately'),publication=await buildMetadataPublication({mint,name:'Test',symbol:'TEST',description:'Test'},image,'https://grainpad.fun'),large=encode('validated header bytes'),small=encode('validated small header bytes');
 const header={sha256:await contentHash(large),smallSha256:await contentHash(small),type:'image/png',mint,metadataHash:publication.metadataHash,imageHash:publication.imageHash,signature:'validated-by-route'},identityIntent={mint,metadataHash:publication.metadataHash,imageHash:publication.imageHash,xCommunity:'https://x.com/i/communities/123456789',signature:'validated-by-route'};
 const claim={mint,metadata:publication.metadata,uri:publication.uri,profile:publication.profile,imageHash:publication.imageHash,header,identityIntent},objects=new Map([[`owners/${publication.metadataHash}/${owner}`,encode(JSON.stringify(claim))],[`assets/${publication.metadataHash}`,encode(JSON.stringify(publication.metadata))],[`assets/${publication.imageHash}`,image],[`assets/${header.sha256}`,large],[`assets/${header.smallSha256}`,small]]);
 const storage={get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key).slice().buffer}:null,put(){assert.fail('Completed retry never writes.');}};return {args:{owner,mint,publication,header,identityIntent},claim,objects,storage};
}
test('completed claim requires exact sealed extras; different owner, header or intent never receives exemption',async()=>{
 const f=await fixture();assert.equal((await completedMetadataRetry(f.storage,f.args)).metadataHash,f.args.publication.metadataHash);
 for(const patch of [{owner:'another-owner'},{header:null},{header:{...f.args.header,signature:'different'}},{identityIntent:null},{identityIntent:{...f.args.identityIntent,xCommunity:'https://x.com/i/communities/987654321'}}])assert.equal(await completedMetadataRetry(f.storage,{...f.args,...patch}),null);
 assert.equal(await completedMetadataRetry({get(){assert.fail('IPFS is never a cached fast path');}},{...f.args,publication:{...f.args.publication,profile:'ipfs-raw-v1'}}),null);
});
test('missing and corrupted publication, image and either header rendition cannot count as completed persistence',async()=>{
 const f=await fixture();for(const hash of [f.args.publication.metadataHash,f.args.publication.imageHash,f.args.header.sha256,f.args.header.smallSha256]){const key=`assets/${hash}`,original=f.objects.get(key);f.objects.delete(key);await assert.rejects(completedMetadataRetry(f.storage,f.args),/incomplete/);f.objects.set(key,encode('corrupt'));await assert.rejects(completedMetadataRetry(f.storage,f.args),/integrity/);f.objects.set(key,original);}
 const claimKey=`owners/${f.args.publication.metadataHash}/${f.args.owner}`;f.objects.set(claimKey,encode('bad json'));await assert.rejects(completedMetadataRetry(f.storage,f.args),/claim integrity/);f.objects.set(claimKey,encode(JSON.stringify({...f.claim,mint:'wrong'})));await assert.rejects(completedMetadataRetry(f.storage,f.args),/differs/);
});
