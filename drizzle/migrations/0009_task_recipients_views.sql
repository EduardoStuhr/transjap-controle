CREATE TABLE IF NOT EXISTS `task_recipients` (
  `task_id` text NOT NULL,
  `user_id` text NOT NULL,
  `user_name` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`task_id`, `user_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_task_recipients_user_id` ON `task_recipients` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_views` (
  `task_id` text NOT NULL,
  `user_id` text NOT NULL,
  `user_name` text NOT NULL,
  `viewed_at` text NOT NULL,
  PRIMARY KEY (`task_id`, `user_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_task_views_user_id` ON `task_views` (`user_id`);
