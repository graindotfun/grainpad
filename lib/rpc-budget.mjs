/** Public-export variant of lib/rpc-budget.mjs (packaging substitution; see README.md).
 * EXAMPLE caps for local builds and tests only. They are not Grainpad's production settings.
 * A deployment must set every RPC_* cap explicitly; overrides use the same validation and bounds. */
import {rpcComputeUnits,createRpcCaps,createRpcBudgetAllocator as createAllocator} from './rpc-budget-core.mjs';
export {rpcComputeUnits};
export const RPC_CAP_EXAMPLE=Object.freeze({RPC_WINDOW_MS:10_000,RPC_GLOBAL_WINDOW_CU:2_000,RPC_TRADE_WINDOW_CU:1_200,RPC_DISPLAY_WINDOW_CU:800,RPC_TRADE_DAILY_CU:100_000,RPC_DISPLAY_DAILY_CU:100_000,RPC_BUDGET_LEASE_CU:100,RPC_RECOVERY_DAILY_CU:20_000});
export const rpcCaps=createRpcCaps(RPC_CAP_EXAMPLE);
export function createRpcBudgetAllocator(){return createAllocator(rpcCaps);}
export const reserveRpcBudget=createRpcBudgetAllocator();
