CREATE TABLE IF NOT EXISTS `task_notification_reads` (
  `task_id` text NOT NULL,
  `user_id` text NOT NULL,
  `user_name` text NOT NULL,
  `read_at` text NOT NULL,
  PRIMARY KEY (`task_id`, `user_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `idx_task_notification_reads_user_id`
ON `task_notification_reads` (`user_id`);
