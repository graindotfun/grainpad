import {env} from "cloudflare:workers";
import {createGrainpetApi} from "./grainpet-api.mjs";
import {r2Store} from "./grainpet-store.mjs";
import {consumeRequestBudget} from "./abuse-budget.mjs";
import {bucket} from "./server-utils";
import {database} from "./server-owner";
export function grainpetApi(){
 const secret=(env as unknown as {RPC_SESSION_SECRET?:string}).RPC_SESSION_SECRET as string;
 return createGrainpetApi({secret,store:r2Store(bucket()),budget:(key:string,limit:number,windowMs?:number)=>consumeRequestBudget(database(),key,limit,windowMs?{windowMs}:{})});
}
