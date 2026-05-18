CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`icon` text NOT NULL,
	`hours` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`tone` text NOT NULL,
	`location` text NOT NULL,
	`last_maintenance` text NOT NULL,
	`series_number` text,
	`acquisition_date` text,
	`manufacturer` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`min_quantity` integer DEFAULT 0 NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_sku_unique` ON `inventory_items` (`sku`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`author` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maintenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`item` text DEFAULT '' NOT NULL,
	`service_description` text DEFAULT '' NOT NULL,
	`submitted_by` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`completed_by` text DEFAULT '',
	`observation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `maintenance_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maintenance_timeline` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `maintenance_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_timeline` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`status` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`assigned_to` text NOT NULL,
	`sector` text NOT NULL,
	`priority` text NOT NULL,
	`deadline` text,
	`status` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`viewed_by` text DEFAULT '{}' NOT NULL,
	`viewed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);