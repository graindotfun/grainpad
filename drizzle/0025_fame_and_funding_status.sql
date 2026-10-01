CREATE TABLE `wallet_fame` (
	`voter` text NOT NULL,
	`target` text NOT NULL,
	`value` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`signature` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`voter`, `target`),
	CHECK(`value` IN (-1, 1)),
	CHECK(`voter` <> `target`)
);
--> statement-breakpoint
CREATE INDEX `wallet_fame_target` ON `wallet_fame` (`target`);
--> statement-breakpoint
CREATE TABLE `wallet_fame_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`voter` text NOT NULL,
	`target` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer NOT NULL,
	`payload` text NOT NULL,
	CHECK(`value` IN (-1, 0, 1))
);
--> statement-breakpoint
CREATE INDEX `wallet_fame_revision_pair` ON `wallet_fame_revision` (`voter`,`target`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `room_funding_status` (
	`creator` text NOT NULL,
	`asset` text NOT NULL,
	`balance_raw` text NOT NULL,
	`decimals` integer NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`creator`, `asset`)
);
