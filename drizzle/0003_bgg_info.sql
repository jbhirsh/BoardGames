CREATE TABLE `bgg_info` (
	`bgg_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`honours` text NOT NULL,
	`weight` real,
	`honours_from` integer,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner_awards` (
	`bgg_id` integer NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	PRIMARY KEY(`bgg_id`, `name`, `year`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_at` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `games` DROP COLUMN `awards`;--> statement-breakpoint
ALTER TABLE `games` DROP COLUMN `weight`;