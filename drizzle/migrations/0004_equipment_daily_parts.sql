CREATE TABLE `equipment_daily_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text DEFAULT 'legacy' NOT NULL,
	`fleet` text DEFAULT '' NOT NULL,
	`fleet_label` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`source_sheet` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OK' NOT NULL,
	`used_in_analysis` integer DEFAULT true NOT NULL,
	`imported_at` text NOT NULL
);
