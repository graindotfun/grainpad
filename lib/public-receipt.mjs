/** Only registered, finalized facts. Missing evidence stays null with explicit coverage. */
/** @param {object} row
 * @param {{officialMint?:string|null,indexedAt?:number|null}} options */
export function publicReceipt(row,{officialMint=null,indexedAt=null}={}){
 return {version:1,mint:row.mint,pool:row.pool,platform:row.platformId,creator:row.creator,
 official:row.mint===officialMint,network:row.network,name:row.name,symbol:row.symbol,
 metadata:{uri:row.uri||null,image:row.image||null,hash:row.metadataHash||null,permanence:'not verified'},
 registeredAt:row.createdAt,launchTime:null,indexedAt,proofSlot:row.proofSlot??null,
 quote:{symbol:row.quoteAsset||null,mint:row.quoteMint||null},
 declaredCreatorBuy:row.creatorMetadataClaimed===true&&row.declaredCreatorBuy?{amount:row.declaredCreatorBuy,asset:row.quoteAsset,status:'creator declaration; execution not verified'}:null,
 mintAuthority:row.mintAuthority===null?null:'not checked',freezeAuthority:row.freezeAuthority===null?null:'not checked',
 supply:row.supply||null,decimals:row.decimals??null,
 transferTax:registeredTransferTax(row),
 coverage:{launch:'finalized accounts verified',launchTransaction:'not indexed',creatorBuy:'execution not checked',earlyBuyers:'not indexed',holderConcentration:'not checked',walletFunding:'not checked',fees:'current rates available on token page; historical changes not indexed',tape:'partial; finalized events in the shared index',monero:'no mainnet record published'},
 links:{proof:`/token/${row.mint}/proof`,market:`/token/${row.mint}`,trades:`/api/tape/${row.mint}`},
 notice:'Facts and coverage, not a safety verdict. Registration time is not the on-chain launch time.'};
}

/** Transfer tax proven at registration. `rewards:null` is the registration's explicit "classic token" result;
 * a record without the field is legacy and stays unknown rather than 0.
 * @param {any} row */
export function registeredTransferTax(row){
 if(row.rewards===null)return {registeredBps:0,basis:'classic SPL token: no transfer fee',collectedIn:null,maximumFeeRaw:null};
 const bps=row.rewards?.taxBps;
 if(!Number.isInteger(bps)||bps<0||bps>=10000)return {registeredBps:null,basis:'not recorded at registration',collectedIn:null,maximumFeeRaw:null};
 return {registeredBps:bps,basis:'Token-2022 transfer fee, verified on chain at registration',collectedIn:row.symbol||null,maximumFeeRaw:row.rewards.maximumFeeRaw??null};
}
/** Adds the latest chain-read rate from the market snapshot. A difference is shown, never hidden.
 * @param {ReturnType<typeof registeredTransferTax>} registered
 * @param {{transferTaxBps?:unknown}|null} snapshot
 * @param {number|null} [observedAt] */
export function receiptTransferTax(registered,snapshot,observedAt=null){
 const current=Number.isInteger(snapshot?.transferTaxBps)?Number(snapshot?.transferTaxBps):null;
 const bps=current??registered.registeredBps;
 return {...registered,currentBps:current,currentObservedAt:current===null?null:observedAt,
  bps,percent:bps===null?null:`${(bps/100).toFixed(bps%10?2:1)}%`,
  changedSinceRegistration:current!==null&&registered.registeredBps!==null&&current!==registered.registeredBps};
}
