ALTER TABLE `maintenance_records` ADD `supplier_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_records` ADD `material_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_records` ADD `cost` real DEFAULT 0 NOT NULL;
