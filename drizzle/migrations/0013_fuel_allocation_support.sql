CREATE TABLE IF NOT EXISTS `fuel_allocations` (
  `id` text PRIMARY KEY NOT NULL,
  `source_fueling_id` text NOT NULL,
  `equipment_id` text NOT NULL,
  `fleet` text NOT NULL,
  `pde_id` text,
  `pde_date` text NOT NULL,
  `obra` text DEFAULT '',
  `hourmeter_start` real NOT NULL,
  `hourmeter_end` real NOT NULL,
  `allocated_hours` real NOT NULL,
  `liters_allocated` real NOT NULL,
  `cost_allocated` real NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fuel_allocation_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `source_fueling_id` text,
  `equipment_id` text,
  `fleet` text,
  `type` text NOT NULL,
  `message` text NOT NULL,
  `unresolved_hours` real DEFAULT 0,
  `metadata` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fuel_allocations_fleet_date`
ON `fuel_allocations` (`fleet`, `pde_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fuel_allocations_source`
ON `fuel_allocations` (`source_fueling_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fuel_allocations_obra`
ON `fuel_allocations` (`obra`);
