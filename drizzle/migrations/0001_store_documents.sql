CREATE TABLE IF NOT EXISTS `store_documents` (
	`module` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`module`, `id`)
);
