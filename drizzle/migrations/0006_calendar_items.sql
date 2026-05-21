ALTER TABLE `reminders` ADD `kind` text DEFAULT 'reminder' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `end_time` text;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `location` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `priority` text DEFAULT 'média' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reminders` ADD `status` text DEFAULT 'pendente' NOT NULL;
