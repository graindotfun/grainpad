import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveOfficialCreatorBuy,assertOfficialCreatorBuyReservation,bindOfficialCreatorBuyReservation} from '../lib/official-creator-buy-reservation.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {OFFICIAL_CREATOR_BUY,RETIRED_CREATOR_BUY_MINT} from '../lib/official-creator-buy.mjs';
import bs58 from 'bs58';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0035_official_creator_buy_reservation.sql',import.meta.url),'utf8'));return {sqlite,prepare(query){const statement=sqlite.prepare(query);const bound=(...values)=>({run:async()=>({meta:{changes:Number(statement.run(...values).changes)}}),first:async()=>statement.get(...values)||null});return {...bound(),bind:bound};}};}
const review=(n=1)=>({version:1,officialCreatorBuy:true,id:n.toString(16).padStart(32,'0'),messageHash:n.toString(16).padStart(64,'0'),mint:RETIRED_CREATOR_BUY_MINT,owner:PLATFORM_SETTINGS.admin,side:'buy',amount:String(OFFICIAL_CREATOR_BUY.inputLamports),maxTotalDebitLamports:OFFICIAL_CREATOR_BUY.routeMaximumDebitLamports,createdAt:1000,expiresAt:61000});
const signature=bs58.encode(Buffer.alloc(64,12)),otherSignature=bs58.encode(Buffer.alloc(64,13));
test('retired official mint refuses new and expired shortcut reservations without journal writes',async()=>{
 const db=database();for(const one of [review(),{...review(2),createdAt:62000,expiresAt:122000}])await assert.rejects(reserveOfficialCreatorBuy(db,one,one.createdAt+1),/permanently retired/);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM official_creator_buy_reservation').get().n,0);
});
function seed(db,one=review()) {db.sqlite.prepare('INSERT INTO official_creator_buy_reservation VALUES(?,?,?,?,?,?,?,?)').run(one.mint,one.owner,one.id,one.messageHash,one.expiresAt,one.createdAt,signature,3000);return one;}
test('retirement refuses old signed review preflight and submission without changing preserved evidence',async()=>{
 const db=database(),one=seed(db),before=db.sqlite.prepare('SELECT * FROM official_creator_buy_reservation').get();
 await assert.rejects(assertOfficialCreatorBuyReservation(db,one),/permanently retired/);
 await assert.rejects(bindOfficialCreatorBuyReservation(db,one,signature,3100),/permanently retired/);
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM official_creator_buy_reservation').get(),before);
});
test('SQL still refuses deleting or rewriting historical signed reservations',()=>{
 const db=database();seed(db);assert.throws(()=>db.sqlite.exec('DELETE FROM official_creator_buy_reservation'),/cannot be deleted/);
 assert.throws(()=>db.sqlite.prepare('UPDATE official_creator_buy_reservation SET signature=?').run(otherSignature),/immutable/);
 assert.throws(()=>db.sqlite.exec('UPDATE official_creator_buy_reservation SET signature=NULL,signed_at=NULL'),/immutable/);
});
test('normal buys and sells remain independent from retired shortcut reservation',async()=>{
 const db=database();assert.equal(await assertOfficialCreatorBuyReservation(db,{side:'sell',mint:RETIRED_CREATOR_BUY_MINT}),null);
 assert.equal(await bindOfficialCreatorBuyReservation(db,{side:'buy',mint:RETIRED_CREATOR_BUY_MINT},signature),null);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM official_creator_buy_reservation').get().n,0);
});
test('concurrent retired shortcut preparations both reject and reserve nothing',async()=>{
 const db=database(),results=await Promise.allSettled([reserveOfficialCreatorBuy(db,review(11),2000),reserveOfficialCreatorBuy(db,review(12),2000)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,0);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM official_creator_buy_reservation').get().n,0);
});
