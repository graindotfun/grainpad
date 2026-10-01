/** One upstream simulation proves payer cost within one bank. No signer or send operation. */
import {Buffer} from 'buffer';
import {transactionAddressKeys} from './transaction-addresses.mjs';
/** @param {{sigVerify:boolean,addresses:string[],minContextSlot?:number,allowPayerCredit?:boolean,addressContext?:any}} options */
export async function simulationCostProof(connection,transaction,owner,{sigVerify,addresses,minContextSlot=1,allowPayerCredit=false,addressContext=undefined}){
 const keys=transactionAddressKeys(transaction,addressContext),payer=String(owner);
 if(keys[0]!==payer||!Array.isArray(addresses)||addresses[0]!==payer||new Set(addresses).size!==addresses.length||addresses.some(a=>!keys.includes(a)))throw Error('Unsupported cost proof account mapping.');
 if(typeof sigVerify!=='boolean'||!Number.isSafeInteger(minContextSlot)||minContextSlot<1||typeof connection._rpcRequest!=='function')throw Error('Cost proof transport or configuration unavailable.');
 minContextSlot=Math.max(minContextSlot,addressContext?.slot||1);
 const bytes=Buffer.from(transaction.serialize());if(bytes.length>1232)throw Error('Cost proof transaction exceeds the packet limit.');
 const raw=await connection._rpcRequest('simulateTransaction',[bytes.toString('base64'),{encoding:'base64',commitment:'confirmed',sigVerify,minContextSlot,accounts:{encoding:'base64',addresses}}]);
 const sim=raw?.result,v=sim?.value,safe=x=>Number.isSafeInteger(x)&&x>=0;
 if(raw?.error||!Number.isSafeInteger(sim?.context?.slot)||sim.context.slot<minContextSlot||v?.err!==null||!safe(v?.fee)||!Array.isArray(v?.preBalances)||!Array.isArray(v?.postBalances)||v.preBalances.length!==keys.length||v.postBalances.length!==keys.length||!v.preBalances.every(safe)||!v.postBalances.every(safe)||!Array.isArray(v.accounts)||v.accounts.length!==addresses.length||!Array.isArray(v.loadedAddresses?.readonly)||!Array.isArray(v.loadedAddresses?.writable)||JSON.stringify(v.loadedAddresses.readonly)!==JSON.stringify(addressContext?.loadedReadonly||[])||JSON.stringify(v.loadedAddresses.writable)!==JSON.stringify(addressContext?.loadedWritable||[]))throw Error('Single-response cost proof unavailable or invalid. Nothing was sent.');
 for(let i=0;i<addresses.length;i++){const a=v.accounts[i],post=v.postBalances[keys.indexOf(addresses[i])];if(a===null?post!==0:!safe(a?.lamports)||a.lamports!==post)throw Error('Simulation account balance disagrees with its cost proof.');}
 const before=v.preBalances[0],after=v.postBalances[0],movement=before-after;
 if(movement<0&&!allowPayerCredit)throw Error('Cost proof has an unexpected payer credit.');
 return {before,after,debit:Math.max(0,movement),units:v.unitsConsumed??null,accounts:v.accounts,slot:sim.context.slot,attempts:1,fee:v.fee,sim};
}
