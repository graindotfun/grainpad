/** One display set for finalized pagination and confirmed catch-up. Finalized wins by signature. */
export function tapeLedgerRows(indexed=[],older=[],pending=[]){
 const finalized=[...new Map([...indexed,...older].map(event=>[event.id,event])).values()].sort((a,b)=>b.slot-a.slot||b.id.localeCompare(a.id));
 const signatures=new Set(finalized.map(event=>event.signature));
 const confirmed=[...new Map(pending.filter(event=>!signatures.has(event.signature)).map(event=>[event.id,event])).values()];
 return {finalized,confirmed};
}
