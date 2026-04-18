ALTER TABLE "organizations" ALTER COLUMN "max_users" SET DEFAULT 25;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_workspaces" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_resources_per_workspace" SET DEFAULT 2000;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "max_monthly_spend_microdollars" SET DEFAULT 300000000;