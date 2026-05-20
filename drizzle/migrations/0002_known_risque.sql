CREATE TABLE `fueling` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`vehicle_id` text DEFAULT '' NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`vehicle_type` text DEFAULT '' NOT NULL,
	`km_previous` real DEFAULT 0 NOT NULL,
	`km_current` real DEFAULT 0 NOT NULL,
	`liters` real DEFAULT 0 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`consumption` real DEFAULT 0 NOT NULL,
	`standard_consumption` real DEFAULT 0 NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`status` text,
	`import_batch_id` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `swell_factors` (
	`obra` text NOT NULL,
	`material` text NOT NULL,
	`factor` real DEFAULT 0.3 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`obra`, `material`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`operation` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`vehicle_id` text DEFAULT '' NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`driver` text DEFAULT '' NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`destination` text DEFAULT '' NOT NULL,
	`km` real DEFAULT 0 NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`cubic_m_loose` real DEFAULT 0 NOT NULL,
	`swell_factor_applied` real DEFAULT 0.3 NOT NULL,
	`cubic_m_compacted` real DEFAULT 0 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`status` text,
	`import_batch_id` text NOT NULL,
	`imported_at` text NOT NULL
);
