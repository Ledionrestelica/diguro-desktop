ALTER TABLE "file_folders" DROP CONSTRAINT "file_folders_scope_exclusive";--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_scope_exclusive";--> statement-breakpoint
ALTER TABLE "file_folders" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_folders_organization_idx" ON "file_folders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "resources_organization_created_idx" ON "resources" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_scope_exclusive" CHECK ((
        (CASE WHEN "file_folders"."organization_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "file_folders"."workspace_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "file_folders"."user_id" IS NOT NULL THEN 1 ELSE 0 END)
      ) = 1);--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_scope_exclusive" CHECK ((
        (CASE WHEN "resources"."organization_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "resources"."workspace_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "resources"."user_id" IS NOT NULL THEN 1 ELSE 0 END)
      ) = 1);