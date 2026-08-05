CREATE TABLE IF NOT EXISTS `horometro_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`fleet` text NOT NULL,
	`fleet_label` text DEFAULT '' NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`horometro_value` real NOT NULL,
	`type` text DEFAULT 'leitura' NOT NULL,
	`photo_url` text,
	`ocr_confidence` real DEFAULT 1,
	`operator_name` text DEFAULT 'Operador' NOT NULL,
	`operator_id` text,
	`status` text DEFAULT 'aprovado' NOT NULL,
	`raw_ocr_text` text,
	`notes` text,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_horometro_logs_fleet_date` ON `horometro_logs` (`fleet`,`date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_horometro_logs_date` ON `horometro_logs` (`date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_horometro_logs_obra` ON `horometro_logs` (`obra`);
