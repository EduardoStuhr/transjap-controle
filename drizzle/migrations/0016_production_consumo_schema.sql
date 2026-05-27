ALTER TABLE `equipment` ADD COLUMN `subtype` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `equipment_daily_parts` ADD COLUMN `horim_inicial` real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `equipment_daily_parts` ADD COLUMN `horim_final` real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `fuel_attribution` ADD COLUMN `analysis_id` text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fuelattr_analysis` ON `fuel_attribution` (`analysis_id`);
