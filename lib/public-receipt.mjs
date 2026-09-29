/** Only registered, finalized facts. Missing evidence stays null with explicit coverage. */
/** @param {object} row
 * @param {{officialMint?:string|null,indexedAt?:number|null}} options */
export function publicReceipt(row,{officialMint=null,indexedAt=null}={}){
 return {version:1,mint:row.mint,pool:row.pool,platform:row.platformId,creator:row.creator,
 official:row.mint===officialMint,network:row.network,name:row.name,symbol:row.symbol,
 metadata:{uri:row.uri||null,image:row.image||null,permanence:'not verified'},
 registeredAt:row.createdAt,launchTime:null,indexedAt,proofSlot:row.proofSlot??null,
 quote:{symbol:row.quoteAsset||null,mint:row.quoteMint||null},
 declaredCreatorBuy:row.declaredCreatorBuy?{amount:row.declaredCreatorBuy,asset:row.quoteAsset,status:'creator declaration; execution not verified'}:null,
 mintAuthority:row.mintAuthority===null?null:'not checked',freezeAuthority:row.freezeAuthority===null?null:'not checked',
 supply:row.supply||null,decimals:row.decimals??null,
 coverage:{launch:'finalized accounts verified',launchTransaction:'not indexed',creatorBuy:'execution not checked',earlyBuyers:'not indexed',holderConcentration:'not checked',walletFunding:'not checked',fees:'current rates available on token page; historical changes not indexed',tape:'partial; finalized events in the shared index'},
 links:{proof:`/token/${row.mint}/proof`,market:`/token/${row.mint}`,trades:`/api/tape/${row.mint}`},
 notice:'Facts and coverage, not a safety verdict. Registration time is not the on-chain launch time.'};
}
