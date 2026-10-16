import type {MainnetLaunchRecord} from './robinhood-mainnet-registration.ts';
/** Public display snapshot only. Never an input to a quote, approval or transaction builder. */
export type RobinhoodDisplayMarket={tokenAddress:string;factory:string;block:string;continuous:boolean;pool:string|null;locker:string|null;realQuote:string;inventory:string;supply:string};
export function robinhoodDisplayMarket(value:unknown,record:MainnetLaunchRecord):RobinhoodDisplayMarket{
 const v=value as Record<string,unknown>;
 if(!v||v.networkId!=='robinhood:mainnet'||v.tokenAddress!==record.tokenAddress||v.factory!==record.factory||typeof v.continuous!=='boolean'||typeof v.block!=='string'||!/^0x[0-9a-f]+$/i.test(v.block))throw Error('Market identity unavailable.');
 for(const field of ['realQuote','inventory','supply'])if(typeof v[field]!=='string'||!/^\d{1,78}$/.test(v[field] as string))throw Error('Market figures unavailable.');
 for(const field of ['pool','locker'])if(v[field]!==null&&(typeof v[field]!=='string'||!/^0x[0-9a-f]{40}$/.test(v[field] as string)))throw Error('Pool identity unavailable.');
 return {tokenAddress:record.tokenAddress,factory:record.factory,block:v.block,continuous:v.continuous,pool:v.pool as string|null,locker:v.locker as string|null,realQuote:v.realQuote as string,inventory:v.inventory as string,supply:v.supply as string};
}
export function robinhoodDisplayUnits(value:string){const n=Number(BigInt(value))/1e18;return Number.isFinite(n)?n>0&&n<0.000001?n.toExponential(3):new Intl.NumberFormat('en-US',{notation:n>=10000?'compact':'standard',maximumSignificantDigits:6}).format(n):'—';}
