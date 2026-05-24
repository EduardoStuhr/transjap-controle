-- ALTER TABLEs already applied by previous partial migration run; only create indexes.
CREATE INDEX IF NOT EXISTS `idx_tasks_kind` ON `tasks` (`kind`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_created_by_user_id` ON `tasks` (`created_by_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_updated_at` ON `tasks` (`updated_at`);
