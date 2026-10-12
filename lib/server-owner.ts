import {executionDatabase} from './indexer-execution.mjs';
import nacl from "tweetnacl";
import bs58 from "bs58";
import {env} from "cloudflare:workers";
import {SITE} from "./site-config";
import {ownerMessage,type OwnerRequest} from "./owner-message";
export function database(){const db=(env as unknown as {DB?:D1Database}).DB;if(!db)throw Error("The platform ledger is temporarily unavailable.");return executionDatabase(db) as D1Database;}
export function verifyOwner(r:OwnerRequest,signature:string,action:OwnerRequest["action"]){
 if(!r||r.action!==action||typeof r.value!=="string"||r.value.length>200||!Number.isSafeInteger(r.expires)||r.expires<Date.now()||r.expires>Date.now()+300000||!/^[0-9a-f-]{36}$/.test(r.nonce))throw Error("Owner approval is invalid or expired.");
 if(!nacl.sign.detached.verify(new TextEncoder().encode(ownerMessage(r)),bs58.decode(signature),bs58.decode(SITE.projectWallet)))throw Error("The Grainpad owner must approve this change.");
}
