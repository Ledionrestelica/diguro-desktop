ALTER TYPE "public"."usage_type" ADD VALUE 'CONTEXTUALIZE';--> statement-breakpoint
ALTER TYPE "public"."usage_type" ADD VALUE 'TITLE';--> statement-breakpoint
ALTER TABLE "token_usage" ALTER COLUMN "prompt_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "token_usage" ALTER COLUMN "completion_tokens" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "token_usage" ALTER COLUMN "cost_microdollars" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "cached_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "reasoning_tokens" integer;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "units" integer;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "pricing_version" text;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "token_usage" ADD COLUMN "resource_version_id" text;--> statement-breakpoint
CREATE INDEX "token_usage_conversation_idx" ON "token_usage" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "token_usage_resource_version_idx" ON "token_usage" USING btree ("resource_version_id");--> statement-breakpoint
CREATE INDEX "token_usage_provider_req_idx" ON "token_usage" USING btree ("provider_request_id");