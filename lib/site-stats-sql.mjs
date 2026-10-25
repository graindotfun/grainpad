/** SQL shared by the homepage stats and their measurement. Dependency-free, so tools can run it without npm. */
// Gaps are found from this mint's own streams (CROSS JOIN keeps them outer, so the queue is read through its
// (source,status) index) and each event by the primary-key range of its signature: every chain_event id starts with
// `${signature}:` (saveEvents; the unary + keeps the planner on that range). The earlier form read the whole queue per
// launch and every event of the mint per queued row: 6.4 s for 40 launches, 40,000 events and 2,500 queued rows in a
// local run (now 2 ms), while a live overview refresh took about 15 s and held D1 for other requests meanwhile.
export const GAPS_SQL=`(SELECT count(*) FROM indexer_stream s CROSS JOIN indexer_queue q ON q.source=s.address AND q.status IN ('pending','quarantined') WHERE s.mint=l.mint
  AND NOT EXISTS (SELECT 1 FROM chain_event x WHERE x.id>=q.signature||':' AND x.id<q.signature||';' AND x.signature=q.signature AND +x.mint=l.mint))`;
