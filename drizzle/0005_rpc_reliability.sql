CREATE TABLE `rpc_budget_state` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`day` integer NOT NULL,
	`trade_window` integer NOT NULL,
	`display_window` integer NOT NULL,
	`trade_day` integer NOT NULL,
	`display_day` integer NOT NULL,
	`granted` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rpc_submissions` (
	`signature` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rpc_submissions_expiry` ON `rpc_submissions` (`expires_at`);