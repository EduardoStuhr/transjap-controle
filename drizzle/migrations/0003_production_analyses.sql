CREATE TABLE `production_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`date_start` text NOT NULL,
	`date_end` text NOT NULL,
	`swell_factor` real DEFAULT 0.3 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trips` ADD `analysis_id` text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE `fueling` ADD `analysis_id` text DEFAULT 'legacy' NOT NULL;
