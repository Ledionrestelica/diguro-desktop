ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
-- Everyone who already has an account predates onboarding; don't send them
-- through it.
UPDATE "users" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;
