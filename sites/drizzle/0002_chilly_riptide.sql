CREATE TABLE `google_accounts` (
	`owner` text NOT NULL,
	`account` text NOT NULL,
	`tokens` text NOT NULL,
	`expires` integer NOT NULL,
	`connected_at` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	PRIMARY KEY(`owner`, `account`)
);
--> statement-breakpoint
ALTER TABLE `calendars` ADD `connection_account` text;