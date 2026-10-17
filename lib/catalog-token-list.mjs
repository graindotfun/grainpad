/** Catalog-only identity projection; excludes unverified launches before identity reads and pagination. */
import {indexedLaunchPage} from './catalog-launch-index.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {loadPublicIdentity,tokenListDocument,TOKEN_LIST_CAP,SOLANA_MAINNET_CHAIN_ID} from './canonical-identity.mjs';
import {currentCanonicalPresentation} from './identity-amendment.mjs';
import {TOKEN_WEBSITE_ORIGIN} from './token-website.mjs';
// Preserve the canonical token-list schema without changing operated native dependencies.
function tokenInfo(entry,decimals,presentation=null){
 const document=entry.document;
 const twitter=presentation?presentation.twitter:document.twitter;
 const telegram=presentation?presentation.telegram:document.telegram;
 const header=presentation?presentation.header:document.header;
 const extensions={website:document.website};
 if(document.description)extensions.description=document.description;
 if(twitter)extensions.twitter=twitter;
 if(telegram)extensions.telegram=telegram;
 if(presentation?.xCommunity)extensions.xCommunity=presentation.xCommunity;
 if(header){extensions.header=header.uri;extensions.headerSha256=header.sha256;extensions.header600=header.renditions['600x200'].uri;extensions.header600Sha256=header.renditions['600x200'].sha256;}
 if(document.creator)extensions.creator=document.creator;
 if(document.launch){extensions.chain=document.launch.chain;extensions.programId=document.launch.programId;if(document.launch.platformId)extensions.platformId=document.launch.platformId;if(document.launch.pool)extensions.pool=document.launch.pool;if(document.launch.quoteMint)extensions.quoteMint=document.launch.quoteMint;if(document.launch.quoteAsset)extensions.quoteAsset=document.launch.quoteAsset;if(document.launch.slot!=null)extensions.slot=String(document.launch.slot);if(document.launch.signature)extensions.signature=document.launch.signature;}
 extensions.launchedAt=document.sealedAt;
 extensions.identityUri=`${TOKEN_WEBSITE_ORIGIN}/api/identity/token/${document.mint}`;
 extensions.identitySha256=entry.sha256;
 return {
  chainId:SOLANA_MAINNET_CHAIN_ID,address:document.mint,name:document.name,symbol:document.symbol,decimals,
  logoURI:document.image.uri,tags:['grainpad-launch'],extensions,
 };
}
export async function publicCatalogTokenList(db,storage){
 const platform=grainpadPlatformId().toBase58();
 const launches=[];
 let cursor=null;
 do{
  const page=await indexedLaunchPage(db,'mainnet-beta',platform,cursor);
  launches.push(...page.launches);
  cursor=page.nextCursor;
  if(cursor&&launches.length>=TOKEN_LIST_CAP)throw Error('Token list cap exceeded.');
 }while(cursor);
 const entries=[];
 for(const launch of launches){
  if(launch.verification!=='confirmed-on-chain'||launch.network!=='mainnet-beta')continue;
  const identity=await loadPublicIdentity(db,storage,launch.mint);
  const decimals=Number.isInteger(launch.decimals)&&launch.decimals>=0&&launch.decimals<=9?launch.decimals:6;
  let presentation=null;try{presentation=await currentCanonicalPresentation(storage,identity);}catch{presentation=null;}
  entries.push({info:tokenInfo(identity,decimals,presentation)});
 }
 return tokenListDocument(entries);
}
