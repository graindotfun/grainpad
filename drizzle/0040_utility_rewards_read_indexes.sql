-- Optional at utility release; additive read indexes only. No credit, payment,
-- operator policy or verified receipt contents change. Never applied live here.
CREATE INDEX utility_rewards_owner_members ON holder_reward_credit_payment_member(owner,kind,signature);
--> statement-breakpoint
CREATE INDEX utility_rewards_payment_page ON holder_reward_credit_payment(verified_at DESC,signature DESC);
--> statement-breakpoint
CREATE INDEX utility_rewards_source_page ON holder_reward_credit_payment(mint,verified_at DESC,signature DESC);
