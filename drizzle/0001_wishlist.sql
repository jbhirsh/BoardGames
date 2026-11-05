CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`suggested_by` text,
	`players` text,
	`min_players` integer NOT NULL,
	`max_players` integer NOT NULL,
	`dur` text,
	`minutes` integer NOT NULL,
	`description` text NOT NULL,
	`keywords` text NOT NULL,
	`section` text,
	`awards` text NOT NULL,
	`asin` text,
	`expands` text,
	`video` text,
	`image` text,
	`bgg_id` integer,
	`year` integer,
	`weight` real,
	`created_at` integer,
	CONSTRAINT "games_status_known" CHECK("games"."status" IN ('wanted', 'arriving', 'owned', 'removed')),
	CONSTRAINT "games_source_known" CHECK("games"."source" IN ('curated', 'friend', 'owner'))
);
--> statement-breakpoint
CREATE INDEX `games_status` ON `games` (`status`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_name` text NOT NULL,
	`name` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`game_id` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "suggestions_status_known" CHECK("suggestions"."status" IN ('pending', 'approved', 'denied', 'unsent', 'removed')),
	CONSTRAINT "suggestions_source_known" CHECK("suggestions"."source" IN ('friend', 'owner'))
);
--> statement-breakpoint
CREATE INDEX `suggestions_status` ON `suggestions` (`status`);--> statement-breakpoint
CREATE TABLE `votes` (
	`game_id` text NOT NULL,
	`anon_id` text NOT NULL,
	PRIMARY KEY(`game_id`, `anon_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
