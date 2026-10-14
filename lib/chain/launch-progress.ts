/** Pure progress and recovery derivation for the one-approval launch. No I/O, no wallet. */
import {keccak_256} from "@noble/hashes/sha3";

export const LAUNCH_STAGES = ["submitted", "created", "metadata_verified", "awaiting_monero", "trading_available"] as const;
export type LaunchStage = (typeof LAUNCH_STAGES)[number];
export const MONERO_CONFIRMATIONS_REQUIRED = 10;

export type LaunchFacts = {
  /** Hash returned by the wallet, or recovered from the journal. null: the wallet was never asked, or refused. */
  transactionHash: string | null;
  /** The wallet request was started but no hash was returned (closed tab, timeout). */
  submissionStarted: boolean;
  receipt: "none" | "pending" | "success" | "reverted";
  /** Receipt block is finalized and canonical. Required before a revert may release the launch id. */
  receiptFinalized: boolean;
  /** `tokenOf(launchId)` on the factory is non-zero. Detects success when the tx hash was lost. */
  tokenExistsForLaunchId: boolean;
  metadata: "unknown" | "match" | "mismatch";
  moneroAuthorized: boolean;
  moneroConfirmations: number | null;
  admitted: boolean;
};

export type LaunchProgress = {
  stage: LaunchStage | null;
  /** What the UI may say. `blocked` is a stop that needs a person; `recover` is automatic. */
  status: "working" | "blocked" | "failed" | "done" | "idle";
  detail: string;
  /** Creating again is only safe when nothing was started, or a finalized revert proves nothing exists. */
  mayCreateAgain: boolean;
  nextAutomaticStep: "none" | "poll_receipt" | "probe_launch_id" | "verify_metadata" | "register" | "poll_monero" | "admit";
};

export function deriveLaunchProgress(f: LaunchFacts): LaunchProgress {
  const started = f.submissionStarted || f.transactionHash !== null;
  if (!started && !f.tokenExistsForLaunchId) return {stage: null, status: "idle", detail: "Ready to launch.", mayCreateAgain: true, nextAutomaticStep: "none"};
  if (f.receipt === "reverted" && !f.tokenExistsForLaunchId) {
    if (f.receiptFinalized) return {stage: null, status: "failed", detail: "The launch reverted on-chain; nothing was created.", mayCreateAgain: true, nextAutomaticStep: "none"};
    return {stage: "submitted", status: "working", detail: "Revert seen but not final. Waiting before releasing this launch.", mayCreateAgain: false, nextAutomaticStep: "poll_receipt"};
  }
  if (f.receipt !== "success" && !f.tokenExistsForLaunchId) {
    if (f.transactionHash === null) return {stage: "submitted", status: "working", detail: "Wallet request outcome unknown. Checking the chain for this launch before anything can be repeated.", mayCreateAgain: false, nextAutomaticStep: "probe_launch_id"};
    return {stage: "submitted", status: "working", detail: "Submitted. Waiting for the chain.", mayCreateAgain: false, nextAutomaticStep: "poll_receipt"};
  }
  if (f.metadata === "mismatch") return {stage: "created", status: "blocked", detail: "Created on-chain, but the served metadata does not match the bound hash. Do not create again.", mayCreateAgain: false, nextAutomaticStep: "verify_metadata"};
  if (f.metadata !== "match") return {stage: "created", status: "working", detail: "Created on-chain. Verifying metadata.", mayCreateAgain: false, nextAutomaticStep: "verify_metadata"};
  if (f.admitted) return {stage: "trading_available", status: "done", detail: "Monero registration verified. Trading is available.", mayCreateAgain: false, nextAutomaticStep: "none"};
  if (!f.moneroAuthorized) return {stage: "metadata_verified", status: "working", detail: "Metadata verified. Registering with Monero.", mayCreateAgain: false, nextAutomaticStep: "register"};
  const n = f.moneroConfirmations;
  return {stage: "awaiting_monero", status: "working",
    detail: n === null ? "Registration submitted. Waiting for Monero confirmations." : `Monero confirmations ${Math.min(n, MONERO_CONFIRMATIONS_REQUIRED)}/${MONERO_CONFIRMATIONS_REQUIRED}.`,
    mayCreateAgain: false, nextAutomaticStep: n !== null && n >= MONERO_CONFIRMATIONS_REQUIRED ? "admit" : "poll_monero"};
}

/** `tokenOf(bytes32)` call data, for the launch-id probe that survives a lost transaction hash. */
export function tokenOfCalldata(launchId: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(launchId)) throw new Error("Invalid launch id.");
  const selector = Array.from(keccak_256(new TextEncoder().encode("tokenOf(bytes32)")).slice(0, 4), b => b.toString(16).padStart(2, "0")).join("");
  return "0x" + selector + launchId.slice(2).toLowerCase();
}
