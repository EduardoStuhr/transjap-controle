CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `endpoint` text NOT NULL UNIQUE,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `expiration_time` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_push_subscriptions_user_id` ON `push_subscriptions` (`user_id`);
