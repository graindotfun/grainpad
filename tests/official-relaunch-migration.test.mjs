import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../drizzle/0036_official_relaunch_generation.sql',import.meta.url),'utf8');
const deletionStart=migration.indexOf('DELETE FROM official_token WHERE id=1;');

function populatedDatabase(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../drizzle/0026_official_launch_reservation.sql',import.meta.url),'utf8'));
 db.exec("CREATE TABLE official_token (id INTEGER PRIMARY KEY,mint TEXT NOT NULL,pool TEXT NOT NULL,published_at TEXT NOT NULL,approval TEXT NOT NULL,token_program TEXT NOT NULL)");
 const approval=JSON.stringify({proof:'אישור מלא — '.repeat(1000),signature:'original-signature'});
 db.prepare('INSERT INTO official_token VALUES (1,?,?,?,?,?)').run('old-mint','old-pool','2026-10-03',approval,'original-program');
 db.prepare('INSERT INTO official_launch_reservation VALUES (1,?,?,?,?,?,?,?,?,?)').run('old-mint','old-creator','metadata-hash','message-hash','original-signature','blockhash',100,'registered',1);
 return db;
}

for(const table of ['official_token_history','official_launch_reservation_history'])test(`relaunch refuses conflicting ${table} before removing either live singleton`,()=>{
 const keys=table==='official_token_history'?['mint','pool','token_program','published_at','approval']:['mint','creator','metadata_hash','message_hash','signature','blockhash','expiry','state','created_at'];
 for(const key of keys){
  const db=populatedDatabase();
  try{
   const before={token:db.prepare('SELECT * FROM official_token').get(),reservation:db.prepare('SELECT * FROM official_launch_reservation').get(),attempts:db.prepare('SELECT * FROM official_launch_attempt').all()};
   // Model archives left by an interrupted earlier run, then retry the full migration.
   db.exec(migration.slice(0,deletionStart));
   db.exec('DROP TRIGGER official_token_relaunch_archive_guard; DROP TRIGGER official_reservation_relaunch_archive_guard;');
   const value=['expiry','created_at'].includes(key)?999:'different';
   db.prepare(`UPDATE ${table} SET ${key}=? WHERE generation=1 AND id=1`).run(value);
   assert.throws(()=>db.exec(migration),/archive does not match live records/,`${table}.${key}`);
   assert.deepEqual(db.prepare('SELECT * FROM official_token').get(),before.token);
   assert.deepEqual(db.prepare('SELECT * FROM official_launch_reservation').get(),before.reservation);
   assert.deepEqual(db.prepare('SELECT * FROM official_launch_attempt').all(),before.attempts);
  }finally{db.close();}
 }
});

test('relaunch preserves a long approval and accepts identical archives from a partial run',()=>{
 const db=populatedDatabase();
 try{
  const before=db.prepare('SELECT * FROM official_token').get();
  assert.ok(Buffer.byteLength(before.approval)>10000);
  db.exec(migration.slice(0,deletionStart));
  db.exec(migration);
  assert.equal(db.prepare('SELECT approval FROM official_token_history WHERE generation=1 AND id=1').get().approval,before.approval);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_token').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_launch_reservation').get().n,0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('official_token_relaunch_archive_guard','official_reservation_relaunch_archive_guard')").get().n,0);
 }finally{db.close();}
});

test('relaunch migration preserves populated generation-one evidence and unrelated ledgers',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../drizzle/0026_official_launch_reservation.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../drizzle/0035_official_creator_buy_reservation.sql',import.meta.url),'utf8'));
  db.exec("CREATE TABLE official_token (id INTEGER PRIMARY KEY,mint TEXT NOT NULL,pool TEXT NOT NULL,published_at TEXT NOT NULL,approval TEXT NOT NULL,token_program TEXT NOT NULL); CREATE TABLE preserved_receipts (id TEXT PRIMARY KEY,payload TEXT NOT NULL)");
  db.prepare('INSERT INTO official_token VALUES (1,?,?,?,?,?)').run('previous-mint','previous-pool','2026-10-03','original-approval','original-token-program');
  db.prepare('INSERT INTO official_launch_reservation VALUES (1,?,?,?,?,?,?,?,?,?)').run('previous-mint','previous-creator','metadata-hash','message-hash','launch-signature','blockhash',100,'registered',1);
  db.prepare('INSERT INTO official_creator_buy_reservation VALUES (?,?,?,?,?,?,?,?)').run('previous-mint','previous-creator','buy-review','buy-message',100,1,'buy-signature',2);
  db.prepare('INSERT INTO preserved_receipts VALUES (?,?)').run('receipt-1','original-payload');
  const before={token:db.prepare('SELECT * FROM official_token').get(),reservation:db.prepare('SELECT * FROM official_launch_reservation').get(),attempts:db.prepare('SELECT * FROM official_launch_attempt').all(),buys:db.prepare('SELECT * FROM official_creator_buy_reservation').all(),receipts:db.prepare('SELECT * FROM preserved_receipts').all()};
  db.exec(readFileSync(new URL('../drizzle/0036_official_relaunch_generation.sql',import.meta.url),'utf8'));
  for(const [table,original] of [['official_token_history',before.token],['official_launch_reservation_history',before.reservation]]){
   const archived=db.prepare(`SELECT * FROM ${table} WHERE generation=1`).get();
   for(const [key,value] of Object.entries(original))assert.equal(archived[key],value,`${table}.${key}`);
   assert.equal(archived.status,'previous-unsupported');
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_token').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_launch_reservation').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM official_generation_identity').get().n,0);
  assert.deepEqual(db.prepare('SELECT * FROM official_launch_attempt').all(),before.attempts);
  assert.deepEqual(db.prepare('SELECT * FROM official_creator_buy_reservation').all(),before.buys);
  assert.deepEqual(db.prepare('SELECT * FROM preserved_receipts').all(),before.receipts);
  assert.throws(()=>db.exec("UPDATE official_creator_buy_reservation SET signature='replacement'"),/immutable/);
  assert.throws(()=>db.exec('DELETE FROM official_creator_buy_reservation'),/cannot be deleted/);
 }finally{db.close();}
});
