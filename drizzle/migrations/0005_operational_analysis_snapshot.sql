ALTER TABLE `production_analyses` ADD `tipo_analise` text DEFAULT 'operacional' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `metrics` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `aggregate_metrics` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `machine_metrics` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `charts` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `audit` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `production_analyses` ADD `context` text DEFAULT '{}' NOT NULL;
