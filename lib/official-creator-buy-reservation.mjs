/** Dedicated single-use shortcut. Generic owner trades remain independent.
 * Only expired unsigned reviews can be replaced. Signed attempts retain their
 * exact identity forever, including uncertain sends; same-signature resend is safe.
 */
import {assertOfficialCreatorBuyRequest} from './official-creator-buy.mjs';
const marked = review => review?.officialCreatorBuy === true;
function identity(review) {
 assertOfficialCreatorBuyRequest(review, {publishedMint:review?.mint});
 if(!/^[a-f0-9]{32}$/.test(review.id)||!/^[a-f0-9]{64}$/.test(review.messageHash)||!Number.isSafeInteger(review.expiresAt)||!Number.isSafeInteger(review.createdAt))throw Error('Invalid official creator buy review.');
}
export async function reserveOfficialCreatorBuy(db, review, now=Date.now()) {
 if(!marked(review))throw Error('Official creator buy marker required.');
 identity(review);
 if(review.expiresAt<=now)throw Error('Creator buy review expired. Prepare a fresh review.');
 await db.prepare(`INSERT INTO official_creator_buy_reservation(mint,owner,review_id,message_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)
 ON CONFLICT(mint) DO UPDATE SET review_id=excluded.review_id,message_hash=excluded.message_hash,expires_at=excluded.expires_at,created_at=excluded.created_at
 WHERE official_creator_buy_reservation.owner=excluded.owner AND official_creator_buy_reservation.signature IS NULL AND official_creator_buy_reservation.expires_at<=?`).bind(review.mint,review.owner,review.id,review.messageHash,review.expiresAt,review.createdAt,now).run();
 await assertOfficialCreatorBuyReservation(db,review);
 return review;
}
export async function assertOfficialCreatorBuyReservation(db,review) {
 if(!marked(review))return null;
 identity(review);
 const row=await db.prepare('SELECT * FROM official_creator_buy_reservation WHERE mint=?').bind(review.mint).first();
 if(!row||row.owner!==review.owner||row.review_id!==review.id||row.message_hash!==review.messageHash||row.expires_at!==review.expiresAt)throw Error('The official creator buy already has another reserved review or signed transaction. Check its receipt instead of signing again.');
 return row;
}
export async function bindOfficialCreatorBuyReservation(db,review,signature,now=Date.now()) {
 if(!marked(review))return null;
 await assertOfficialCreatorBuyReservation(db,review);
 if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw Error('Owner-signed creator buy signature required.');
 await db.prepare(`UPDATE official_creator_buy_reservation SET signature=?,signed_at=? WHERE mint=? AND owner=? AND review_id=? AND message_hash=? AND expires_at=? AND signature IS NULL`).bind(signature,now,review.mint,review.owner,review.id,review.messageHash,review.expiresAt).run();
 const row=await assertOfficialCreatorBuyReservation(db,review);
 if(row.signature!==signature)throw Error('Official creator buy is bound to another signed transaction.');
 return row;
}
