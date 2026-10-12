/** The pilot exception belongs to one registered, immutable reservation, never a ticker. */
export async function isRegisteredPilotPublication(db, launch, mint, platformId) {
 if (launch?.symbol !== 'GRAINU' || launch.mint !== mint || launch.platformId !== platformId ||
     launch.network !== 'mainnet-beta' || launch.verification !== 'confirmed-on-chain' ||
     !Number.isSafeInteger(launch.proofSlot) || launch.proofSlot < 1 || !launch.creator ||
     !/^[0-9a-f]{64}$/.test(launch.metadataHash ?? '')) return false;
 const row = await db.prepare('SELECT mint,creator,metadata_hash,state FROM pilot_reservation WHERE id=1').first();
 return row?.state === 'registered' && row.mint === mint && row.creator === launch.creator &&
     row.metadata_hash === launch.metadataHash;
}
