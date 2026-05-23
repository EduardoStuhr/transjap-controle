CREATE TABLE `fuel_attribution` (
	`id` text PRIMARY KEY NOT NULL,
	`fleet` text NOT NULL,
	`fleet_label` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`hours_worked` real NOT NULL,
	`liters_attributed` real NOT NULL,
	`cost_attributed` real NOT NULL,
	`source_fueling_id` text,
	`calculated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fuelattr_fleet_date` ON `fuel_attribution` (`fleet`,`date`);--> statement-breakpoint
CREATE INDEX `idx_fuelattr_date` ON `fuel_attribution` (`date`);--> statement-breakpoint
CREATE INDEX `idx_fuelattr_obra` ON `fuel_attribution` (`obra`);
