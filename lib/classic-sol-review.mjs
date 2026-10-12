import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {VersionedTransaction,PublicKey} from '@solana/web3.js';
import {CLASSIC_SOL_MODE} from './classic-sol-policy.mjs';
import {QUOTES} from './quote-assets.mjs';
const fields=['launchMode','network','owner','mint','metadataHash','quoteAsset','quoteMint','maxLamports'];
function template(p){const t=VersionedTransaction.deserialize(p.transaction.serialize());t.message.recentBlockhash=String(PublicKey.default);return Buffer.from(t.message.serialize()).toString('base64');}
function identity(p){return Object.fromEntries(fields.map(k=>[k,String(p[k])]));}
/** A prepared classic review can refresh its blockhash; its mode, spend cap and instruction message remain fixed. */
export function createClassicSolReviewGuard(){const reviews=new WeakMap();return {
 capture(p){if(p.launchMode!==CLASSIC_SOL_MODE||p.network!=='mainnet-beta'||p.quoteAsset!=='SOL'||p.quoteMint!==QUOTES.SOL.mint||p.rewards||p.creatorBuy)throw Error('Invalid classic SOL review.');reviews.set(p,{identity:JSON.stringify(identity(p)),message:template(p)});},
 check(p){const held=reviews.get(p);if(p.launchMode!==CLASSIC_SOL_MODE&&!held)return; if(!held||p.rewards||p.creatorBuy||JSON.stringify(identity(p))!==held.identity||template(p)!==held.message)throw Error('Classic SOL review changed. Prepare a new review before any wallet request.');},
 carry(from,to){const held=reviews.get(from);if(held){reviews.set(to,held);this.check(to);}}
};}
