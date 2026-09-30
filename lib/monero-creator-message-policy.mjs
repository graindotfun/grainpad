/** One creator message only. This grants no publication, native construction or relay authority. */
export const GRAINU_CREATOR_MESSAGE_BINDING=Object.freeze({
 mint:'FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn',
 creator:'FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM',
 metadataHash:'86c01731e98b6ba9c59e7e286a718830fe5ee5cf752758b7ce1afe86dcbb1413',
});
/** @param {any} intent */
export function isGrainuCreatorMessageIdentity(intent){return !!intent&&Object.entries(GRAINU_CREATOR_MESSAGE_BINDING).every(([field,value])=>intent[field]===value);}
/** Only the finalized registered database record can satisfy server admission. @param {any} launch @param {string} mint @param {string} platformId */
export function isRegisteredGrainuCreatorMessage(launch,mint,platformId){return isGrainuCreatorMessageIdentity(launch)&&launch.mint===mint&&launch.platformId===platformId&&launch.symbol==='GRAINU'&&launch.network==='mainnet-beta'&&launch.verification==='confirmed-on-chain'&&Number.isSafeInteger(launch.proofSlot)&&launch.proofSlot>0;}
