-- Additive Rewards Tracker read indexes. Record every pre-existing table before
-- and after; only release_data_count bookkeeping rows are added. No payment,
-- credit, identity, operator policy or verified receipt contents change.
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','chain_event',count(*) FROM chain_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','creator_profile',count(*) FROM creator_profile WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','creator_profile_revision',count(*) FROM creator_profile_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','fee_total',count(*) FROM fee_total WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_credit_payment',count(*) FROM holder_reward_credit_payment WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_credit_payment_member',count(*) FROM holder_reward_credit_payment_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_credit_payment_stage',count(*) FROM holder_reward_credit_payment_stage WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_credit_payment_stage_member',count(*) FROM holder_reward_credit_payment_stage_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_credit_source',count(*) FROM holder_reward_credit_source WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','holder_reward_receipt',count(*) FROM holder_reward_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_execution_guard',count(*) FROM indexer_execution_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_lease',count(*) FROM indexer_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_queue',count(*) FROM indexer_queue WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_run',count(*) FROM indexer_run WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_state',count(*) FROM indexer_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','indexer_stream',count(*) FROM indexer_stream WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','infrastructure_lookup_blockhash_review',count(*) FROM infrastructure_lookup_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','infrastructure_lookup_retired',count(*) FROM infrastructure_lookup_retired WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','infrastructure_lookup_review',count(*) FROM infrastructure_lookup_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','infrastructure_lookup_submission',count(*) FROM infrastructure_lookup_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','launch_index',count(*) FROM launch_index WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','market_cache',count(*) FROM market_cache WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_construction_claim',count(*) FROM monero_construction_claim WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_discovery_candidate',count(*) FROM monero_discovery_candidate WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_discovery_checkpoint',count(*) FROM monero_discovery_checkpoint WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_discovery_guard',count(*) FROM monero_discovery_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_launch_record',count(*) FROM monero_launch_record WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_planned_authorization',count(*) FROM monero_planned_authorization WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_planned_replacement',count(*) FROM monero_planned_replacement WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','monero_publication_job',count(*) FROM monero_publication_job WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_creator_buy_reservation',count(*) FROM official_creator_buy_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_generation_identity',count(*) FROM official_generation_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_launch_attempt',count(*) FROM official_launch_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_launch_blockhash_review',count(*) FROM official_launch_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_launch_reservation',count(*) FROM official_launch_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_launch_reservation_history',count(*) FROM official_launch_reservation_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_token',count(*) FROM official_token WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','official_token_history',count(*) FROM official_token_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','operational_metric',count(*) FROM operational_metric WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','owner_fee_custody_review',count(*) FROM owner_fee_custody_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','pilot_attempt',count(*) FROM pilot_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','pilot_renewal_review',count(*) FROM pilot_renewal_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','pilot_reservation',count(*) FROM pilot_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','release_data_count',count(*) FROM release_data_count WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','resource_lease',count(*) FROM resource_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','room_event',count(*) FROM room_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','room_funding_status',count(*) FROM room_funding_status WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','rpc_budget',count(*) FROM rpc_budget WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','rpc_budget_state',count(*) FROM rpc_budget_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','rpc_client_submissions',count(*) FROM rpc_client_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','rpc_submissions',count(*) FROM rpc_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','sqlite_sequence',count(*) FROM sqlite_sequence WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','token_launch_post',count(*) FROM token_launch_post WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','token_launch_post_revision',count(*) FROM token_launch_post_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_automation_public_balance',count(*) FROM treasury_automation_public_balance WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_automation_public_receipt',count(*) FROM treasury_automation_public_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_automation_public_runtime',count(*) FROM treasury_automation_public_runtime WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_buyback_reviews',count(*) FROM treasury_buyback_reviews WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_receipts',count(*) FROM treasury_receipts WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','treasury_submission',count(*) FROM treasury_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_fame',count(*) FROM wallet_fame WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_fame_revision',count(*) FROM wallet_fame_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity',count(*) FROM wallet_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity_name',count(*) FROM wallet_identity_name WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity_oauth',count(*) FROM wallet_identity_oauth WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity_revision',count(*) FROM wallet_identity_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity_transfer',count(*) FROM wallet_identity_transfer WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','before','wallet_identity_transfer_guard',count(*) FROM wallet_identity_transfer_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
CREATE INDEX utility_rewards_owner_members ON holder_reward_credit_payment_member(owner,kind,signature);
--> statement-breakpoint
CREATE INDEX utility_rewards_payment_page ON holder_reward_credit_payment(verified_at DESC,signature DESC);
--> statement-breakpoint
CREATE INDEX utility_rewards_source_page ON holder_reward_credit_payment(mint,verified_at DESC,signature DESC);
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','chain_event',count(*) FROM chain_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','creator_profile',count(*) FROM creator_profile WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','creator_profile_revision',count(*) FROM creator_profile_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','fee_total',count(*) FROM fee_total WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_credit_payment',count(*) FROM holder_reward_credit_payment WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_credit_payment_member',count(*) FROM holder_reward_credit_payment_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_credit_payment_stage',count(*) FROM holder_reward_credit_payment_stage WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_credit_payment_stage_member',count(*) FROM holder_reward_credit_payment_stage_member WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_credit_source',count(*) FROM holder_reward_credit_source WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','holder_reward_receipt',count(*) FROM holder_reward_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_execution_guard',count(*) FROM indexer_execution_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_lease',count(*) FROM indexer_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_queue',count(*) FROM indexer_queue WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_run',count(*) FROM indexer_run WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_state',count(*) FROM indexer_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','indexer_stream',count(*) FROM indexer_stream WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','infrastructure_lookup_blockhash_review',count(*) FROM infrastructure_lookup_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','infrastructure_lookup_retired',count(*) FROM infrastructure_lookup_retired WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','infrastructure_lookup_review',count(*) FROM infrastructure_lookup_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','infrastructure_lookup_submission',count(*) FROM infrastructure_lookup_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','launch_index',count(*) FROM launch_index WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','market_cache',count(*) FROM market_cache WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_construction_claim',count(*) FROM monero_construction_claim WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_discovery_candidate',count(*) FROM monero_discovery_candidate WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_discovery_checkpoint',count(*) FROM monero_discovery_checkpoint WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_discovery_guard',count(*) FROM monero_discovery_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_launch_record',count(*) FROM monero_launch_record WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_planned_authorization',count(*) FROM monero_planned_authorization WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_planned_replacement',count(*) FROM monero_planned_replacement WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','monero_publication_job',count(*) FROM monero_publication_job WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_creator_buy_reservation',count(*) FROM official_creator_buy_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_generation_identity',count(*) FROM official_generation_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_launch_attempt',count(*) FROM official_launch_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_launch_blockhash_review',count(*) FROM official_launch_blockhash_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_launch_reservation',count(*) FROM official_launch_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_launch_reservation_history',count(*) FROM official_launch_reservation_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_token',count(*) FROM official_token WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','official_token_history',count(*) FROM official_token_history WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','operational_metric',count(*) FROM operational_metric WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','owner_fee_custody_review',count(*) FROM owner_fee_custody_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','pilot_attempt',count(*) FROM pilot_attempt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','pilot_renewal_review',count(*) FROM pilot_renewal_review WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','pilot_reservation',count(*) FROM pilot_reservation WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','release_data_count',count(*) FROM release_data_count WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','resource_lease',count(*) FROM resource_lease WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','room_event',count(*) FROM room_event WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','room_funding_status',count(*) FROM room_funding_status WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','rpc_budget',count(*) FROM rpc_budget WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','rpc_budget_state',count(*) FROM rpc_budget_state WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','rpc_client_submissions',count(*) FROM rpc_client_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','rpc_submissions',count(*) FROM rpc_submissions WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','sqlite_sequence',count(*) FROM sqlite_sequence WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','token_launch_post',count(*) FROM token_launch_post WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','token_launch_post_revision',count(*) FROM token_launch_post_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_automation_public_balance',count(*) FROM treasury_automation_public_balance WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_automation_public_receipt',count(*) FROM treasury_automation_public_receipt WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_automation_public_runtime',count(*) FROM treasury_automation_public_runtime WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_buyback_reviews',count(*) FROM treasury_buyback_reviews WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_receipts',count(*) FROM treasury_receipts WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','treasury_submission',count(*) FROM treasury_submission WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_fame',count(*) FROM wallet_fame WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_fame_revision',count(*) FROM wallet_fame_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity',count(*) FROM wallet_identity WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity_name',count(*) FROM wallet_identity_name WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity_oauth',count(*) FROM wallet_identity_oauth WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity_revision',count(*) FROM wallet_identity_revision WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity_transfer',count(*) FROM wallet_identity_transfer WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
--> statement-breakpoint
INSERT INTO release_data_count(migration,phase,table_name,row_count) SELECT '0040_utility_rewards_read_indexes','after','wallet_identity_transfer_guard',count(*) FROM wallet_identity_transfer_guard WHERE 1 ON CONFLICT(migration,phase,table_name) DO NOTHING;
