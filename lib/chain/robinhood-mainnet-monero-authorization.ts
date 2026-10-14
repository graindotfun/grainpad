import {ROBINHOOD_CHAIN_MAINNET} from "./robinhood-mainnet.ts";
import {address, bytes32} from "./robinhood-market.ts";
import {type MainnetLaunchRecord} from "./robinhood-mainnet-registration.ts";
import {type MainnetWalletSession} from "./robinhood-mainnet-wallet.ts";

export async function signMainnetMoneroChallenge(session:MainnetWalletSession,record:MainnetLaunchRecord,challenge:unknown) {
 const c=challenge as {manifest?:MainnetLaunchRecord;manifestHash?:string;nonce?:string;expiresAt?:string;typedData?:{domain?:{chainId?:number;verifyingContract?:string};message?:{creator?:string;manifestHash?:string;nonce?:string;expiresAt?:string}}};
 if(!c||record.creator!==address(session.account)||!c.manifest)throw Error("Connect the creator wallet to authorize this launch.");
 for(const key of ['networkId','chainId','factory','tokenAddress','creator','launchId','transactionHash','name','symbol'] as const)if(c.manifest[key]!==record[key])throw Error("Monero authorization source identity changed.");
 const hash=bytes32(c.manifestHash),nonce=c.nonce,expiry=c.expiresAt;
 if(typeof nonce!=='string'||!/^0x[0-9a-f]{32}$/.test(nonce)||typeof expiry!=='string'||!/^\d+$/.test(expiry)||BigInt(expiry)*1000n<=BigInt(Date.now()))throw Error("Authorization expired. Request a fresh challenge.");
 if(c.typedData?.domain?.chainId!==4663||c.typedData.domain.verifyingContract!==record.factory||c.typedData.message?.creator!==record.creator||c.typedData.message.manifestHash!==hash||c.typedData.message.nonce!==nonce||c.typedData.message.expiresAt!==expiry)throw Error("Authorization domain or commitment changed.");
 // Build our own exact authorization types, never sign server-supplied arbitrary types.
 const typedData={types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],LaunchAnchor:[{name:'manifestHash',type:'bytes32'},{name:'creator',type:'address'},{name:'nonce',type:'bytes16'},{name:'expiresAt',type:'uint64'}]},primaryType:'LaunchAnchor',domain:{name:'Grainpad Launch Provenance',version:'1',chainId:4663,verifyingContract:record.factory},message:{manifestHash:hash,creator:record.creator,nonce,expiresAt:expiry}};
 async function current(){
  if(BigInt(String(await session.provider.request({method:'eth_chainId'})))!==BigInt(ROBINHOOD_CHAIN_MAINNET.chainId))throw Error('Switch to Robinhood mainnet.');
  const accounts=await session.provider.request({method:'eth_accounts'}) as string[];
  if(!accounts?.[0]||address(accounts[0])!==record.creator)throw Error('Creator wallet changed.');
 }
 await current();
 const signature=await session.provider.request({method:'eth_signTypedData_v4',params:[session.account,JSON.stringify(typedData)]});
 await current();
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('No creator signature returned.');
 return signature;
}
