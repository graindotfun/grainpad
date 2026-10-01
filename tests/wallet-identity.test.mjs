import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {applyIdentity,assertSignedWallet,connectXMessage,identityCards,identityMessage,linkXAccount,normalizeUsername,publicProfile,readPublicIdentity,safeAvatarPath,verifyConnectXSignature,verifyIdentitySignature} from '../lib/wallet-identity.mjs';
import {archiveXAvatar,completeXAuthorization,consumeOauthState,createPkce,oauthCookie,safeXImage,xOauthConfig,xRedirectUri,X_OAUTH_COOKIE} from '../lib/x-oauth.mjs';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const sql of readFileSync(new URL('../drizzle/0024_wallet_identity.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())sqlite.exec(sql);
 sqlite.exec(`CREATE TABLE launch_index (network TEXT, mint TEXT, platform_id TEXT, creator TEXT, pool TEXT, created_at TEXT, record TEXT, indexed_at INTEGER, PRIMARY KEY(network,mint));
  CREATE TABLE room_event (id TEXT PRIMARY KEY, mint TEXT, author TEXT, kind TEXT, title TEXT, body TEXT, url TEXT, target TEXT, created_at INTEGER, payload TEXT, signature TEXT);`);
 return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);const bound=(...values)=>({first:async()=>stmt.get(...values)??null,all:async()=>({results:stmt.all(...values)}),run:async()=>stmt.run(...values)});return {bind:bound,...bound()};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
function wallet(){const pair=nacl.sign.keyPair();return {pair,address:bs58.encode(pair.publicKey)};}
function sign(pair,message){return bs58.encode(nacl.sign.detached(new TextEncoder().encode(message),pair.secretKey));}
const origin='https://grainpad.fun';
function payload(address,extra={}){return {origin,wallet:address,action:'claim',username:'satoshi',displayName:'Satoshi',bio:'Public note',avatarHash:'',nonce:crypto.randomUUID(),expires:Date.now()+60_000,...extra};}

test('username rules reject length, case, reserved names, confusables and homoglyphs',()=>{
 assert.equal(normalizeUsername('satoshi').username,'satoshi');
 assert.throws(()=>normalizeUsername('ab'),/3–20/);
 assert.throws(()=>normalizeUsername('Satoshi'),/lowercase/);
 assert.throws(()=>normalizeUsername('grainpad'),/reserved/);
 assert.throws(()=>normalizeUsername('gr4inpad'),/reserved/);
 assert.throws(()=>normalizeUsername('adm1n'),/reserved/);
 assert.throws(()=>normalizeUsername('аdmin'),/not allowed|lowercase/);
 assert.throws(()=>normalizeUsername('admin\u200b'),/not allowed/);
 assert.throws(()=>normalizeUsername('grain__pad'),/single underscores/);
});
test('mutation requires the signing wallet and ignores a different client wallet',()=>{
 const a=wallet(),b=wallet(),body=payload(a.address);
 const signature=sign(a.pair,identityMessage(body));
 assert.equal(verifyIdentitySignature(body,signature,origin).wallet,a.address);
 assert.throws(()=>verifyIdentitySignature(body,sign(b.pair,identityMessage(body)),origin),/must sign/);
 assert.throws(()=>assertSignedWallet({wallet:b.address,payload:body,signature}),/does not match/);
 assert.doesNotThrow(()=>assertSignedWallet({payload:body,signature}));
 assert.throws(()=>verifyIdentitySignature({...body,expires:Date.now()-1},signature,origin),/expired/);
 assert.throws(()=>verifyIdentitySignature({...body,bio:'<script>alert(1)</script>'},signature,origin),/not allowed/);
 assert.equal(safeAvatarPath('/api/assets/'+'a'.repeat(64)),'/api/assets/'+'a'.repeat(64));
 assert.equal(safeAvatarPath('https://evil.example/a.png'),null);
 assert.equal(safeAvatarPath('javascript:alert(1)'),null);
});
test('claim is race-safe, rename reserves the old name, and wallet-only lookup stays empty',async()=>{
 const db=database(),a=wallet(),b=wallet();
 const first=payload(a.address),signature=sign(a.pair,identityMessage(first));
 const profile=await applyIdentity(db,null,first,signature,null,origin);
 assert.equal(profile.username,'satoshi');assert.equal(profile.xUserId,null);assert.equal(profile.wallet,a.address);
 assert.equal((await applyIdentity(db,null,first,signature,null,origin)).username,'satoshi');
 const other=payload(b.address,{nonce:crypto.randomUUID()});
 await assert.rejects(applyIdentity(db,null,other,sign(b.pair,identityMessage(other)),null,origin),/taken/);
 const confusable=payload(b.address,{username:'sat0shi',nonce:crypto.randomUUID()});
 await assert.rejects(applyIdentity(db,null,confusable,sign(b.pair,identityMessage(confusable)),null,origin),/taken/);
 const renamed=payload(a.address,{action:'rename',username:'nakamoto',displayName:'Satoshi',nonce:crypto.randomUUID()});
 assert.equal((await applyIdentity(db,null,renamed,sign(a.pair,identityMessage(renamed)),null,origin)).username,'nakamoto');
 const stolen=payload(b.address,{username:'satoshi',nonce:crypto.randomUUID()});
 await assert.rejects(applyIdentity(db,null,stolen,sign(b.pair,identityMessage(stolen)),null,origin),/taken/);
 const quiet=payload(a.address,{action:'update',username:'nakamoto',displayName:'Nakamoto',nonce:crypto.randomUUID()});
 assert.equal((await applyIdentity(db,null,quiet,sign(a.pair,identityMessage(quiet)),null,origin)).displayName,'Nakamoto');
 assert.equal(await identityCards(db,[b.address]).then(cards=>cards[b.address]||null),null);
 const cards=await identityCards(db,[a.address,b.address]);
 assert.equal(cards[a.address].username,'nakamoto');assert.equal(cards[b.address],undefined);
 db.sqlite.prepare('INSERT INTO launch_index(network,mint,platform_id,creator,pool,created_at,record,indexed_at) VALUES(?,?,?,?,?,?,?,?)').run('mainnet-beta','mint111111111111111111111111111111111111','platform',a.address,'pool','2026-01-01',JSON.stringify({mint:'mint111111111111111111111111111111111111',name:'Grain',symbol:'GRAIN'}),1);
 db.sqlite.prepare('INSERT INTO room_event(id,mint,author,kind,title,body,url,target,created_at,payload,signature) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('id1','mint111111111111111111111111111111111111',a.address,'submission','Work','secret body','https://example.com','',1,'{}','sig');
 const view=await readPublicIdentity(db,'Nakamoto',{platform:'platform'});
 assert.equal(view.profile.username,'nakamoto');assert.equal(view.created[0].symbol,'GRAIN');assert.equal(view.rooms[0].title,'Work');assert.equal(JSON.stringify(view).includes('secret body'),false);
 const old=await readPublicIdentity(db,'satoshi');assert.equal(old.redirect,'nakamoto');
 const linked=await linkXAccount(db,a.address,{xUserId:'42',xUsername:'satoshi'},{replace:'no',now:5,avatarHash:''});
 assert.equal(linked,'nakamoto');
 const renamedX=await linkXAccount(db,a.address,{xUserId:'42',xUsername:'satoshi_n'},{replace:'no',now:6});
 assert.equal(renamedX,'nakamoto');
 const row=db.sqlite.prepare('SELECT x_user_id,x_username FROM wallet_identity WHERE wallet=?').get(a.address);
 assert.equal(row.x_user_id,'42');assert.equal(row.x_username,'satoshi_n');
 await assert.rejects(linkXAccount(db,b.address,{xUserId:'42',xUsername:'satoshi_n'},{replace:'no',now:7}),/already connected|Claim/);
 const off=payload(a.address,{action:'disconnect-x',username:'nakamoto',displayName:'Nakamoto',bio:'Public note',nonce:crypto.randomUUID()});
 const cleared=await applyIdentity(db,null,off,sign(a.pair,identityMessage(off)),null,origin);
 assert.equal(cleared.xUserId,null);assert.equal(cleared.xVerifiedAt,null);
 const again=await linkXAccount(db,a.address,{xUserId:'42',xUsername:'satoshi'},{replace:'no',now:8});
 assert.equal(again,'nakamoto');
 const shown=publicProfile(db.sqlite.prepare('SELECT * FROM wallet_identity').get());
 assert.equal(shown.xUserId,'42');assert.equal(Object.hasOwn(shown,'signature'),false);assert.equal(Object.hasOwn(shown,'payload'),false);
});
test('X OAuth is optional, callback-bound, and does not return tokens',async()=>{
 assert.equal(xOauthConfig({}),null);assert.equal(xOauthConfig({X_CLIENT_ID:'',X_CLIENT_SECRET:''}),null);
 assert.throws(()=>xOauthConfig({X_CLIENT_ID:'short',X_CLIENT_SECRET:'short'}),/not usable/);
 const config=xOauthConfig({X_CLIENT_ID:'grainpad-app',X_CLIENT_SECRET:'test-secret-value-1'});
 assert.equal(xRedirectUri('https://grainpad.fun'),'https://grainpad.fun/api/identity/x/callback');
 assert.equal(xRedirectUri('http://127.0.0.1:4173'),'http://127.0.0.1:4173/api/identity/x/callback');
 assert.throws(()=>xRedirectUri('https://evil.example'),/not allowed/);
 assert.throws(()=>xRedirectUri('https://grainpad.fun', 'https://evil.example/callback'),/not allowed/);
 assert.equal(safeXImage('https://pbs.twimg.com/profile_images/a.jpg'),'https://pbs.twimg.com/profile_images/a.jpg');
 assert.equal(safeXImage('https://evil.example/a.jpg'),'');
 assert.equal(safeXImage('javascript:alert(1)'),'');
 const pkce=await createPkce();
 assert.match(pkce.verifier,/^[A-Za-z0-9_-]+$/);assert.notEqual(pkce.challenge,pkce.verifier);
 const db=database(),owner=wallet();
 const connect={origin,wallet:owner.address,replace:'no',nonce:crypto.randomUUID(),expires:Date.now()+60_000};
 assert.equal(verifyConnectXSignature(connect,sign(owner.pair,connectXMessage(connect)),origin).wallet,owner.address);
 db.sqlite.prepare('INSERT INTO wallet_identity_oauth(state,wallet,verifier,redirect_uri,replace,expires_at) VALUES(?,?,?,?,?,?)').run(pkce.state,owner.address,pkce.verifier,xRedirectUri(origin),'no',Date.now()+60_000);
 const cookie=oauthCookie(pkce.state,true);
 assert.match(cookie,/HttpOnly/);assert.equal(cookie.includes(pkce.verifier),false);
 await assert.rejects(consumeOauthState(db,pkce.state,'',Date.now()),/expired/);
 const row=await consumeOauthState(db,pkce.state,`${X_OAUTH_COOKIE}=${pkce.state}`,Date.now());
 assert.equal(row.wallet,owner.address);assert.equal(row.verifier,pkce.verifier);
 await assert.rejects(consumeOauthState(db,pkce.state,`${X_OAUTH_COOKIE}=${pkce.state}`,Date.now()),/expired/);
 const token='super-secret-access-token';
 const account=await completeXAuthorization({config,code:'auth-code-1',verifier:pkce.verifier,redirectUri:xRedirectUri(origin),fetchImpl:async url=>{
  if(String(url).includes('oauth2/token'))return {ok:true,json:async()=>({access_token:token,refresh_token:'refresh-secret'})};
  return {ok:true,json:async()=>({data:{id:'99',username:'grain',profile_image_url:'https://evil.example/a.jpg'}})};
 }});
 assert.deepEqual(Object.keys(account).sort(),['profileImageUrl','xUserId','xUsername']);
 assert.equal(JSON.stringify(account).includes(token),false);assert.equal(account.profileImageUrl,'');assert.equal(account.xUserId,'99');
 await assert.rejects(completeXAuthorization({config,code:'auth-code-1',verifier:pkce.verifier,redirectUri:xRedirectUri(origin),fetchImpl:async url=>String(url).includes('token')?{ok:true,json:async()=>({access_token:token})}:{ok:false,status:403,json:async()=>({title:'Your account is suspended.'})}}),/suspended/);
 assert.equal(await archiveXAvatar('https://evil.example/a.jpg',async()=>{throw Error('should not fetch');}),null);
 assert.equal(await archiveXAvatar('https://pbs.twimg.com/a.jpg',async()=>({ok:false,status:302,headers:{get:()=>''},arrayBuffer:async()=>new ArrayBuffer(0)})),null);
});
