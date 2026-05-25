CREATE INDEX IF NOT EXISTS `idx_trips_analysis_date` ON `trips` (`analysis_id`, `datetime`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fueling_analysis_date` ON `fueling` (`analysis_id`, `datetime`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_equipment_daily_parts_analysis_date` ON `equipment_daily_parts` (`analysis_id`, `date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_equipment_daily_parts_fleet_analysis_date` ON `equipment_daily_parts` (`fleet`, `analysis_id`, `date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fuelattr_source_fueling` ON `fuel_attribution` (`source_fueling_id`);
