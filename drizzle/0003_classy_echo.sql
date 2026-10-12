CREATE TABLE `market_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_owner` text
);
--> statement-breakpoint
CREATE TABLE `rpc_budget` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`used` integer NOT NULL
);
