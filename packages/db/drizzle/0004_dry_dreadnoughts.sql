ALTER TABLE "organizations" ALTER COLUMN "max_users" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_workspaces" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_resources_per_workspace" SET DEFAULT 1000;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_monthly_spend_microdollars" SET DEFAULT 75000000;