CREATE TABLE `wallet_identity` (
	`wallet` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_hash` text NOT NULL,
	`bio` text NOT NULL,
	`x_user_id` text NOT NULL,
	`x_username` text NOT NULL,
	`x_avatar_hash` text NOT NULL,
	`x_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`signature` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_identity_username` ON `wallet_identity` (`username`);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_identity_x_user` ON `wallet_identity` (`x_user_id`) WHERE `x_user_id`<>'';
--> statement-breakpoint
CREATE TABLE `wallet_identity_name` (
	`username` text PRIMARY KEY NOT NULL,
	`skeleton` text NOT NULL,
	`wallet` text NOT NULL,
	`current` integer NOT NULL,
	`claimed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_identity_name_skeleton` ON `wallet_identity_name` (`skeleton`);
--> statement-breakpoint
CREATE INDEX `wallet_identity_name_wallet` ON `wallet_identity_name` (`wallet`);
--> statement-breakpoint
CREATE TABLE `wallet_identity_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wallet_identity_revision_wallet` ON `wallet_identity_revision` (`wallet`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `wallet_identity_oauth` (
	`state` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`replace` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wallet_identity_oauth_expiry` ON `wallet_identity_oauth` (`expires_at`);
