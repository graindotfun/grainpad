import type {EvmRequest} from './robinhood-create.ts';

export type LaunchSubmissionRecord = Record<string,unknown> & {id?:string;hash?:string;submissionRequested?:boolean};
const validHash=(value:unknown):value is string=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value)&&!/^0x0{64}$/i.test(value);
export function launchSubmissionLocked(record:Record<string,unknown>|null):boolean {
  return !!record&&(validHash(record.hash)||record.submissionRequested===true||record.reservedHash==='0x'+'0'.repeat(64)||record.submissionRequested===undefined&&typeof record.id==='string'&&!!record.draft);
}
/** A known hash must win over an independent storage copy that only contains an uncertain request. */
export function chooseLaunchSubmissionRecord(...records:(Record<string,unknown>|null)[]):Record<string,unknown>|null {
  const pending=records.filter(launchSubmissionLocked);
  const ids=new Set(pending.map(record=>typeof record?.id==='string'?record.id.toLowerCase():null));
  // Different launch identities must not let a newer known hash hide an earlier uncertain send.
  if(ids.size>1)return pending.find(record=>record&&!validHash(record.hash))??pending[0]??null;
  return records.find(record=>record&&validHash(record.hash))??pending[0]??records.find(record=>!!record)??null;
}
export type LaunchSubmissionBinding=Readonly<{id:string|null;hash:string|null}>;
export function bindLaunchSubmissionRecords(...records:(Record<string,unknown>|null)[]):readonly LaunchSubmissionBinding[] {
  return Object.freeze(records.filter(launchSubmissionLocked).map(record=>Object.freeze({
    id:typeof record?.id==='string'?record.id.toLowerCase():null,
    hash:validHash(record?.hash)?record.hash.toLowerCase():null,
  })));
}
export function conflictingLaunchSubmissionBindings(bindings:readonly LaunchSubmissionBinding[]):boolean {
  return new Set(bindings.map(binding=>binding.id)).size>1||new Set(bindings.flatMap(binding=>binding.hash?[binding.hash]:[])).size>1;
}
/** Only the verified original launch can release its durable submission lock. Recovery of another launch is read-only to this binding. */
export function canClearLaunchSubmission(bindings:readonly LaunchSubmissionBinding[],outcome:{launchId:string|null;transactionHash:string|null}|null):boolean {
  if(!outcome?.launchId||!validHash(outcome.transactionHash)||conflictingLaunchSubmissionBindings(bindings))return false;
  return bindings.every(binding=>!!binding.id&&binding.id===outcome.launchId?.toLowerCase()&&(!binding.hash||binding.hash===outcome.transactionHash?.toLowerCase()));
}
/** Intercepts only the actual send request. Existing builders, simulations and chain/account checks stay unchanged. */
export function journalCreateProvider(provider:EvmRequest,record:LaunchSubmissionRecord,persist:(record:LaunchSubmissionRecord)=>Promise<void>):EvmRequest {
  return {request:async args=>{
    if(args.method!=='eth_sendTransaction')return provider.request(args);
    const requested={...record,submissionRequested:true};
    await persist(requested); // If durable storage fails, the wallet never receives a send request.
    let result:unknown;
    try{result=await provider.request(args);}catch(cause){
      if(cause&&typeof cause==='object'&&'code' in cause&&cause.code===4001)await persist({...record,submissionRequested:false});
      throw cause;
    }
    if(!validHash(result))throw Error('Wallet submission result is uncertain. Check wallet activity and recover its transaction hash before creating again.');
    await persist({...requested,hash:result.toLowerCase()});
    return result;
  }};
}
