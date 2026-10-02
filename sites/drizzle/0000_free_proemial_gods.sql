CREATE TABLE `calendars` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`closer` text NOT NULL,
	`team_status` text NOT NULL,
	`selected` integer DEFAULT 0 NOT NULL,
	`sync_token` text,
	`page_token` text,
	`generation` text,
	`mode` text,
	`last_sync` text,
	`error` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`coverage_from` text,
	`coverage_to` text,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `google_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`tokens` text NOT NULL,
	`expires` integer NOT NULL,
	`connected_at` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_events` (
	`owner` text NOT NULL,
	`calendar_id` text NOT NULL,
	`google_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`generation` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`name` text,
	`phone` text,
	`created_at` text,
	`starts_at` text,
	`ends_at` text,
	`date` text,
	`kind` text NOT NULL,
	`qualified` integer NOT NULL,
	`blocking` integer NOT NULL,
	`raw` text NOT NULL,
	PRIMARY KEY(`owner`, `calendar_id`, `google_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_events_owner_date` ON `google_events` (`owner`,`date`);--> statement-breakpoint
CREATE INDEX `idx_events_owner_kind` ON `google_events` (`owner`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_events_owner_canonical` ON `google_events` (`owner`,`canonical_id`);--> statement-breakpoint
CREATE TABLE `operational_history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`consultation_id` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`value` text NOT NULL,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_history_owner_consultation` ON `operational_history` (`owner`,`consultation_id`);--> statement-breakpoint
CREATE TABLE `operational` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`status` text,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`updated_at` text NOT NULL
);
