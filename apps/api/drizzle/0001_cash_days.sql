CREATE TABLE `cash_days` (
	`date` text PRIMARY KEY NOT NULL,
	`opening_cents` integer DEFAULT 0 NOT NULL,
	`counted_cents` integer,
	`updated_at` integer NOT NULL
);
