-- Owner-requested profile transfer only. Chain ownership and historical signed
-- revisions remain factual and unchanged. Never fabricate a new wallet signature.
CREATE TABLE IF NOT EXISTS wallet_identity_transfer (
 id TEXT PRIMARY KEY NOT NULL,
 old_wallet TEXT NOT NULL,
 new_wallet TEXT NOT NULL,
 profile_snapshot TEXT NOT NULL,
 name_snapshot TEXT NOT NULL,
 transferred_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS wallet_identity_transfer_guard (
 id TEXT PRIMARY KEY NOT NULL,
 valid INTEGER NOT NULL CHECK(valid=1)
);
--> statement-breakpoint
INSERT OR REPLACE INTO wallet_identity_transfer_guard(id,valid)
SELECT '0039_official_identity_wallet_transfer', CASE WHEN
 (EXISTS(SELECT 1 FROM wallet_identity WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND username='grainpad' AND x_user_id='2099561281422237696' AND x_username='GrainXMR' AND x_verified_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM wallet_identity WHERE wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz')
  AND EXISTS(SELECT 1 FROM wallet_identity_name WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND username='grainpad' AND current=1)
  AND NOT EXISTS(SELECT 1 FROM wallet_identity_name WHERE wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz'))
 OR (EXISTS(SELECT 1 FROM wallet_identity_transfer WHERE id='0039_official_identity_wallet_transfer' AND old_wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND new_wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz')
  AND EXISTS(SELECT 1 FROM wallet_identity WHERE wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz' AND username='grainpad' AND x_user_id='2099561281422237696')
  AND NOT EXISTS(SELECT 1 FROM wallet_identity WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM'))
 OR NOT EXISTS(SELECT 1 FROM wallet_identity WHERE username='grainpad' OR wallet IN ('FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM','8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz'))
 THEN 1 ELSE 0 END;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','chain_event',count(*) FROM chain_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','creator_profile',count(*) FROM creator_profile WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','creator_profile_revision',count(*) FROM creator_profile_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','fee_total',count(*) FROM fee_total WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_credit_payment',count(*) FROM holder_reward_credit_payment WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_credit_payment_member',count(*) FROM holder_reward_credit_payment_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_credit_payment_stage',count(*) FROM holder_reward_credit_payment_stage WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_credit_payment_stage_member',count(*) FROM holder_reward_credit_payment_stage_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_credit_source',count(*) FROM holder_reward_credit_source WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','holder_reward_receipt',count(*) FROM holder_reward_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_execution_guard',count(*) FROM indexer_execution_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_lease',count(*) FROM indexer_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_queue',count(*) FROM indexer_queue WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_run',count(*) FROM indexer_run WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_state',count(*) FROM indexer_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','indexer_stream',count(*) FROM indexer_stream WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','infrastructure_lookup_blockhash_review',count(*) FROM infrastructure_lookup_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','infrastructure_lookup_retired',count(*) FROM infrastructure_lookup_retired WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','infrastructure_lookup_review',count(*) FROM infrastructure_lookup_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','infrastructure_lookup_submission',count(*) FROM infrastructure_lookup_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','launch_index',count(*) FROM launch_index WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','market_cache',count(*) FROM market_cache WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_construction_claim',count(*) FROM monero_construction_claim WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_discovery_candidate',count(*) FROM monero_discovery_candidate WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_discovery_checkpoint',count(*) FROM monero_discovery_checkpoint WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_discovery_guard',count(*) FROM monero_discovery_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_launch_record',count(*) FROM monero_launch_record WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_planned_authorization',count(*) FROM monero_planned_authorization WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_planned_replacement',count(*) FROM monero_planned_replacement WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','monero_publication_job',count(*) FROM monero_publication_job WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_creator_buy_reservation',count(*) FROM official_creator_buy_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_generation_identity',count(*) FROM official_generation_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_launch_attempt',count(*) FROM official_launch_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_launch_blockhash_review',count(*) FROM official_launch_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_launch_reservation',count(*) FROM official_launch_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_launch_reservation_history',count(*) FROM official_launch_reservation_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_token',count(*) FROM official_token WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','official_token_history',count(*) FROM official_token_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','operational_metric',count(*) FROM operational_metric WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','owner_fee_custody_review',count(*) FROM owner_fee_custody_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','pilot_attempt',count(*) FROM pilot_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','pilot_renewal_review',count(*) FROM pilot_renewal_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','pilot_reservation',count(*) FROM pilot_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','release_data_count',count(*) FROM release_data_count WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','resource_lease',count(*) FROM resource_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','room_event',count(*) FROM room_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','room_funding_status',count(*) FROM room_funding_status WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','rpc_budget',count(*) FROM rpc_budget WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','rpc_budget_state',count(*) FROM rpc_budget_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','rpc_client_submissions',count(*) FROM rpc_client_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','rpc_submissions',count(*) FROM rpc_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','token_launch_post',count(*) FROM token_launch_post WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','token_launch_post_revision',count(*) FROM token_launch_post_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_automation_public_balance',count(*) FROM treasury_automation_public_balance WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_automation_public_receipt',count(*) FROM treasury_automation_public_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_automation_public_runtime',count(*) FROM treasury_automation_public_runtime WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_buyback_reviews',count(*) FROM treasury_buyback_reviews WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_receipts',count(*) FROM treasury_receipts WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','treasury_submission',count(*) FROM treasury_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_fame',count(*) FROM wallet_fame WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_fame_revision',count(*) FROM wallet_fame_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_identity',count(*) FROM wallet_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_identity_name',count(*) FROM wallet_identity_name WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_identity_oauth',count(*) FROM wallet_identity_oauth WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','before','wallet_identity_revision',count(*) FROM wallet_identity_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO wallet_identity_transfer(id,old_wallet,new_wallet,profile_snapshot,name_snapshot,transferred_at)
SELECT '0039_official_identity_wallet_transfer','FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM','8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz',json_object('wallet',wallet,'username',username,'display_name',display_name,'avatar_hash',avatar_hash,'bio',bio,'x_user_id',x_user_id,'x_username',x_username,'x_avatar_hash',x_avatar_hash,'x_verified_at',x_verified_at,'created_at',created_at,'updated_at',updated_at,'signature',signature,'payload',payload),
 (SELECT json_group_array(json_object('username',username,'skeleton',skeleton,'wallet',wallet,'current',current,'claimed_at',claimed_at)) FROM wallet_identity_name WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM'),
 CAST(strftime('%s','now') AS INTEGER)*1000
FROM wallet_identity WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND username='grainpad'
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
UPDATE wallet_identity SET wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz',updated_at=MAX(updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000)
WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND username='grainpad'
AND EXISTS(SELECT 1 FROM wallet_identity_transfer WHERE id='0039_official_identity_wallet_transfer');
--> statement-breakpoint
UPDATE wallet_identity_name SET wallet='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz'
WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND EXISTS(SELECT 1 FROM wallet_identity_transfer WHERE id='0039_official_identity_wallet_transfer');
--> statement-breakpoint
-- Invalidate old in-flight OAuth callbacks without deleting their records.
UPDATE wallet_identity_oauth SET expires_at=0 WHERE wallet='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM' AND expires_at>0;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','chain_event',count(*) FROM chain_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','creator_profile',count(*) FROM creator_profile WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','creator_profile_revision',count(*) FROM creator_profile_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','fee_total',count(*) FROM fee_total WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_credit_payment',count(*) FROM holder_reward_credit_payment WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_credit_payment_member',count(*) FROM holder_reward_credit_payment_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_credit_payment_stage',count(*) FROM holder_reward_credit_payment_stage WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_credit_payment_stage_member',count(*) FROM holder_reward_credit_payment_stage_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_credit_source',count(*) FROM holder_reward_credit_source WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','holder_reward_receipt',count(*) FROM holder_reward_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_execution_guard',count(*) FROM indexer_execution_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_lease',count(*) FROM indexer_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_queue',count(*) FROM indexer_queue WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_run',count(*) FROM indexer_run WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_state',count(*) FROM indexer_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','indexer_stream',count(*) FROM indexer_stream WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','infrastructure_lookup_blockhash_review',count(*) FROM infrastructure_lookup_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','infrastructure_lookup_retired',count(*) FROM infrastructure_lookup_retired WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','infrastructure_lookup_review',count(*) FROM infrastructure_lookup_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','infrastructure_lookup_submission',count(*) FROM infrastructure_lookup_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','launch_index',count(*) FROM launch_index WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','market_cache',count(*) FROM market_cache WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_construction_claim',count(*) FROM monero_construction_claim WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_discovery_candidate',count(*) FROM monero_discovery_candidate WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_discovery_checkpoint',count(*) FROM monero_discovery_checkpoint WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_discovery_guard',count(*) FROM monero_discovery_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_launch_record',count(*) FROM monero_launch_record WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_planned_authorization',count(*) FROM monero_planned_authorization WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_planned_replacement',count(*) FROM monero_planned_replacement WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','monero_publication_job',count(*) FROM monero_publication_job WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_creator_buy_reservation',count(*) FROM official_creator_buy_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_generation_identity',count(*) FROM official_generation_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_launch_attempt',count(*) FROM official_launch_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_launch_blockhash_review',count(*) FROM official_launch_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_launch_reservation',count(*) FROM official_launch_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_launch_reservation_history',count(*) FROM official_launch_reservation_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_token',count(*) FROM official_token WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','official_token_history',count(*) FROM official_token_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','operational_metric',count(*) FROM operational_metric WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','owner_fee_custody_review',count(*) FROM owner_fee_custody_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','pilot_attempt',count(*) FROM pilot_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','pilot_renewal_review',count(*) FROM pilot_renewal_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','pilot_reservation',count(*) FROM pilot_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','release_data_count',count(*) FROM release_data_count WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','resource_lease',count(*) FROM resource_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','room_event',count(*) FROM room_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','room_funding_status',count(*) FROM room_funding_status WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','rpc_budget',count(*) FROM rpc_budget WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','rpc_budget_state',count(*) FROM rpc_budget_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','rpc_client_submissions',count(*) FROM rpc_client_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','rpc_submissions',count(*) FROM rpc_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','token_launch_post',count(*) FROM token_launch_post WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','token_launch_post_revision',count(*) FROM token_launch_post_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_automation_public_balance',count(*) FROM treasury_automation_public_balance WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_automation_public_receipt',count(*) FROM treasury_automation_public_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_automation_public_runtime',count(*) FROM treasury_automation_public_runtime WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_buyback_reviews',count(*) FROM treasury_buyback_reviews WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_receipts',count(*) FROM treasury_receipts WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','treasury_submission',count(*) FROM treasury_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_fame',count(*) FROM wallet_fame WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_fame_revision',count(*) FROM wallet_fame_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_identity',count(*) FROM wallet_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_identity_name',count(*) FROM wallet_identity_name WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_identity_oauth',count(*) FROM wallet_identity_oauth WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0039_official_identity_wallet_transfer','after','wallet_identity_revision',count(*) FROM wallet_identity_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS wallet_identity_transfer_no_update BEFORE UPDATE ON wallet_identity_transfer BEGIN SELECT RAISE(ABORT,'Identity transfer evidence is immutable.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS wallet_identity_transfer_no_delete BEFORE DELETE ON wallet_identity_transfer BEGIN SELECT RAISE(ABORT,'Identity transfer evidence is immutable.'); END;
