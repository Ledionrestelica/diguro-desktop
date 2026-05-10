import { and, asc, eq, schema, sql } from '@diguro/db';
import { z } from 'zod';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';
import { organizationAdminProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import {
  deleteOrganizationAttachment,
  MAX_LOGO_BYTES,
  presignOrganizationLogo,
  resolveOrganizationLogoUrl,
} from '../../services/organizations/attachments.ts';
import { resolveWorkspaceLogoUrl } from '../../services/workspaces/attachments.ts';
import {
  confirmOrganizationResourceReplace,
  confirmOrganizationResourceUpload,
  initiateOrganizationResourceReplace,
  initiateOrganizationResourceUpload,
  listOrganizationResources,
  MAX_RESOURCE_BYTES,
  moveOrganizationResource,
  removeOrganizationResource,
} from '../../services/resources/organizationFiles.ts';
import {
  createOrganizationFolder,
  deleteOrganizationFolder,
  ensureOrganizationFolder,
  listOrganizationFolders,
  moveOrganizationFolder,
  renameOrganizationFolder,
} from '../../services/resources/folders.ts';
import {
  getOrganizationUsageSummary,
  listRecentOrganizationUsage,
} from '../../services/usage/queries.ts';
import { listOrganizationPerUserSpend } from '../../services/usage/limits.ts';
import { listOrganizationAuditEvents } from '../../services/audit/queries.ts';
import {
  createOrgInvitation,
  listOrgInvitations,
  revokeOrgInvitation,
} from '../../services/organizations/invitations.ts';

const SlugShape = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, and dashes only');

const LogoUrlShape = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) => s.startsWith('organization://') || /^https?:\/\//.test(s),
    'must be an organization:// or https URL',
  );

/**
 * Organization-admin router. Every procedure is scoped to ctx.organization.
 * organization_admins manage their organization (users + workspaces);
 * superadmins also pass. Superadmins acting on a DIFFERENT organization
 * should use adminPlatform procedures which take an explicit organizationId.
 */
export const adminOrganizationRouter = router({
  organizationUpdateBranding: organizationAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120).optional(),
        slug: SlugShape.optional(),
        logoUrl: LogoUrlShape.nullable().optional(),
        primaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const update: Record<string, unknown> = {};
        if (input.name !== undefined) update['name'] = input.name;
        if (input.slug !== undefined) update['slug'] = input.slug;
        if (input.logoUrl !== undefined) update['logoUrl'] = input.logoUrl;
        if (input.primaryColor !== undefined)
          update['primaryColor'] = input.primaryColor;
        if (Object.keys(update).length === 0) return { ok: true as const };
        update['updatedAt'] = new Date();

        const oldRow =
          input.logoUrl !== undefined
            ? (
                await ctx.db
                  .select({ logoUrl: schema.organizations.logoUrl })
                  .from(schema.organizations)
                  .where(eq(schema.organizations.id, ctx.organization.id))
                  .limit(1)
              )[0]
            : undefined;

        await ctx.db
          .update(schema.organizations)
          .set(update)
          .where(eq(schema.organizations.id, ctx.organization.id));

        if (oldRow?.logoUrl && oldRow.logoUrl !== input.logoUrl) {
          await deleteOrganizationAttachment(
            { objectStore: ctx.objectStore },
            { organizationId: ctx.organization.id, url: oldRow.logoUrl },
          ).catch((err: unknown) => {
            ctx.logger.warn('failed to delete previous organization logo', {
              organizationId: ctx.organization.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  logoPresignUpload: organizationAdminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_LOGO_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await presignOrganizationLogo(
          { objectStore: ctx.objectStore },
          {
            organizationId: ctx.organization.id,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  organizationGet: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      const [userCount, workspaceCount] = await Promise.all([
        ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(eq(schema.users.organizationId, ctx.organization.id)),
        ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.workspaces)
          .where(eq(schema.workspaces.organizationId, ctx.organization.id)),
      ]);

      let logoUrl = ctx.organization.logoUrl;
      if (logoUrl?.startsWith('organization://')) {
        logoUrl = await resolveOrganizationLogoUrl(
          { objectStore: ctx.objectStore },
          { organizationId: ctx.organization.id, url: logoUrl },
        ).catch(() => null);
      }

      return {
        ...ctx.organization,
        logoUrl,
        userCount: userCount[0]?.n ?? 0,
        workspaceCount: workspaceCount[0]?.n ?? 0,
      };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  usersList: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          role: schema.users.role,
          banned: schema.users.banned,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.organizationId, ctx.organization.id))
        .orderBy(asc(schema.users.createdAt));
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  userSetRole: organizationAdminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        role: z.enum(['organization_admin', 'user']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.userId === ctx.user.id) {
          throw new Forbidden('Cannot change your own role');
        }
        const res = await ctx.db
          .update(schema.users)
          .set({ role: input.role, updatedAt: new Date() })
          .where(
            and(
              eq(schema.users.id, input.userId),
              eq(schema.users.organizationId, ctx.organization.id),
            ),
          )
          .returning({ id: schema.users.id });
        if (res.length === 0) throw new ResourceNotFound(input.userId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  userRemove: organizationAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.userId === ctx.user.id) {
          throw new Forbidden('Cannot remove yourself from the organization');
        }
        const res = await ctx.db
          .update(schema.users)
          .set({ organizationId: null, role: 'user', updatedAt: new Date() })
          .where(
            and(
              eq(schema.users.id, input.userId),
              eq(schema.users.organizationId, ctx.organization.id),
            ),
          )
          .returning({ id: schema.users.id });
        if (res.length === 0) throw new ResourceNotFound(input.userId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspacesList: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({
          id: schema.workspaces.id,
          name: schema.workspaces.name,
          slug: schema.workspaces.slug,
          logoUrl: schema.workspaces.logoUrl,
          maxMembers: schema.workspaces.maxMembers,
          maxResources: schema.workspaces.maxResources,
          createdAt: schema.workspaces.createdAt,
          // Live member count via correlated subquery — cheap on the
          // small workspaces tables we expect (≤100 per org). Saves a
          // second round-trip from the admin UI.
          memberCount: sql<number>`(
            SELECT COUNT(*)::int FROM members m
            WHERE m.workspace_id = workspaces.id
          )`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.organizationId, ctx.organization.id))
        .orderBy(asc(schema.workspaces.createdAt));

      return await Promise.all(
        rows.map(async (row) => {
          if (!row.logoUrl?.startsWith('workspace://')) return row;
          const resolved = await resolveWorkspaceLogoUrl(
            { objectStore: ctx.objectStore },
            { workspaceId: row.id, url: row.logoUrl },
          ).catch(() => null);
          return { ...row, logoUrl: resolved };
        }),
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  /**
   * List members of a specific workspace. Org-admin scoped — verifies
   * the workspace belongs to the caller's organization before returning.
   * Powers the admin's per-workspace member panel.
   */
  workspaceMembersList: organizationAdminProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const wsRows = await ctx.db
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.workspaceId),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!wsRows[0]) throw new ResourceNotFound(input.workspaceId);

        const rows = await ctx.db
          .select({
            memberId: schema.members.id,
            userId: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            role: schema.members.role,
            joinedAt: schema.members.createdAt,
          })
          .from(schema.members)
          .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
          .where(eq(schema.members.workspaceId, input.workspaceId))
          .orderBy(asc(schema.members.createdAt));
        return rows;
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /**
   * List users in the org who are NOT yet members of the given workspace.
   * Used by the "Add member" picker. Filters by org membership so we
   * never surface users from another tenant.
   */
  workspaceAddableUsers: organizationAdminProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const wsRows = await ctx.db
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.workspaceId),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!wsRows[0]) throw new ResourceNotFound(input.workspaceId);

        const rows = await ctx.db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            role: schema.users.role,
          })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.organizationId, ctx.organization.id),
              sql`NOT EXISTS (
                SELECT 1 FROM members m
                WHERE m.user_id = ${schema.users.id}
                  AND m.workspace_id = ${input.workspaceId}
              )`,
            ),
          )
          .orderBy(asc(schema.users.email));
        return rows;
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceMemberAdd: organizationAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify both the workspace and the target user belong to this
        // org. Without this, an org admin could add foreign-org users to
        // their workspaces, leaking access across tenants.
        const wsRows = await ctx.db
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.workspaceId),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!wsRows[0]) throw new ResourceNotFound(input.workspaceId);

        const userRows = await ctx.db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.id, input.userId),
              eq(schema.users.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!userRows[0]) {
          throw new Forbidden('User does not belong to this organization');
        }

        // Unique index on (workspace, user) makes this an upsert via
        // ON CONFLICT DO NOTHING — re-adding an existing member silently
        // succeeds. The role is NOT updated on conflict; admins use
        // workspaceMemberSetRole for that, intentional separate action.
        await ctx.db
          .insert(schema.members)
          .values({
            id: crypto.randomUUID(),
            workspaceId: input.workspaceId,
            userId: input.userId,
            role: input.role,
          })
          .onConflictDoNothing({
            target: [schema.members.workspaceId, schema.members.userId],
          });
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceMemberRemove: organizationAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        memberId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const wsRows = await ctx.db
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.workspaceId),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!wsRows[0]) throw new ResourceNotFound(input.workspaceId);

        const res = await ctx.db
          .delete(schema.members)
          .where(
            and(
              eq(schema.members.id, input.memberId),
              eq(schema.members.workspaceId, input.workspaceId),
            ),
          )
          .returning({ id: schema.members.id });
        if (res.length === 0) throw new ResourceNotFound(input.memberId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceMemberSetRole: organizationAdminProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        memberId: z.string().min(1),
        role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const wsRows = await ctx.db
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.workspaceId),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .limit(1);
        if (!wsRows[0]) throw new ResourceNotFound(input.workspaceId);

        const res = await ctx.db
          .update(schema.members)
          .set({ role: input.role })
          .where(
            and(
              eq(schema.members.id, input.memberId),
              eq(schema.members.workspaceId, input.workspaceId),
            ),
          )
          .returning({ id: schema.members.id });
        if (res.length === 0) throw new ResourceNotFound(input.memberId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceCreate: organizationAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        slug: SlugShape,
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [{ n: count } = { n: 0 }] = await ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.workspaces)
          .where(eq(schema.workspaces.organizationId, ctx.organization.id));
        if (count >= ctx.organization.maxWorkspaces) {
          throw new Forbidden(
            `Workspace limit reached (${ctx.organization.maxWorkspaces}). Contact support to raise it.`,
          );
        }
        const id = crypto.randomUUID();
        await ctx.db.transaction(async (tx) => {
          await tx.insert(schema.workspaces).values({
            id,
            organizationId: ctx.organization.id,
            name: input.name,
            slug: input.slug,
            ...(input.description ? { description: input.description } : {}),
          });
          await tx.insert(schema.members).values({
            id: crypto.randomUUID(),
            workspaceId: id,
            userId: ctx.user.id,
            role: 'OWNER',
          });
          await tx
            .update(schema.sessions)
            .set({ activeWorkspaceId: id, updatedAt: new Date() })
            .where(eq(schema.sessions.id, ctx.session.id));
        });
        return { id };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceDelete: organizationAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await ctx.db
          .delete(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.id, input.id),
              eq(schema.workspaces.organizationId, ctx.organization.id),
            ),
          )
          .returning({ id: schema.workspaces.id });
        if (res.length === 0) throw new ResourceNotFound(input.id);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /* === Organization files (RAG resources) === */

  filesList: organizationAdminProcedure
    .input(
      z
        .object({
          search: z.string().max(120).optional(),
          folderId: z.string().min(1).nullable().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listOrganizationResources(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            ...(input?.search ? { search: input.search } : {}),
            ...(input && 'folderId' in input ? { folderId: input.folderId ?? null } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesInitiateUpload: organizationAdminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_RESOURCE_BYTES),
        folderId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await initiateOrganizationResourceUpload(
          { db: ctx.db, objectStore: ctx.objectStore },
          {
            organizationId: ctx.organization.id,
            uploaderId: ctx.user.id,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
            folderId: input.folderId ?? null,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesConfirmUpload: organizationAdminProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmOrganizationResourceUpload(
          { db: ctx.db, queue: ctx.queue, logger: ctx.logger },
          {
            organizationId: ctx.organization.id,
            versionId: input.versionId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesRemove: organizationAdminProcedure
    .input(z.object({ resourceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await removeOrganizationResource(
          { db: ctx.db, objectStore: ctx.objectStore, logger: ctx.logger },
          {
            organizationId: ctx.organization.id,
            resourceId: input.resourceId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesInitiateReplace: organizationAdminProcedure
    .input(
      z.object({
        resourceId: z.string().min(1),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_RESOURCE_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await initiateOrganizationResourceReplace(
          { db: ctx.db, objectStore: ctx.objectStore },
          {
            organizationId: ctx.organization.id,
            uploaderId: ctx.user.id,
            resourceId: input.resourceId,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesConfirmReplace: organizationAdminProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmOrganizationResourceReplace(
          { db: ctx.db, queue: ctx.queue, logger: ctx.logger },
          {
            organizationId: ctx.organization.id,
            versionId: input.versionId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesMove: organizationAdminProcedure
    .input(
      z.object({
        resourceId: z.string().min(1),
        folderId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await moveOrganizationResource(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            resourceId: input.resourceId,
            folderId: input.folderId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /* === Organization folders === */

  foldersList: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      return await listOrganizationFolders(
        { db: ctx.db },
        { organizationId: ctx.organization.id },
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  folderCreate: organizationAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        parentId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOrganizationFolder(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            name: input.name,
            parentId: input.parentId ?? null,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderEnsure: organizationAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        parentId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ensureOrganizationFolder(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            name: input.name,
            parentId: input.parentId ?? null,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderRename: organizationAdminProcedure
    .input(
      z.object({
        folderId: z.string().min(1),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await renameOrganizationFolder(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            folderId: input.folderId,
            name: input.name,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderMove: organizationAdminProcedure
    .input(
      z.object({
        folderId: z.string().min(1),
        parentId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await moveOrganizationFolder(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            folderId: input.folderId,
            parentId: input.parentId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderDelete: organizationAdminProcedure
    .input(z.object({ folderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteOrganizationFolder(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            folderId: input.folderId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /* === Token usage + audit (org-admin read-only views) === */

  usageSummary: organizationAdminProcedure
    .input(
      z
        .object({
          /** ISO string. Defaults to current month (UTC). */
          since: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await getOrganizationUsageSummary(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            ...(input?.since ? { since: new Date(input.since) } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  usageRecent: organizationAdminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listRecentOrganizationUsage(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            ...(input?.limit !== undefined ? { limit: input.limit } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  invitesList: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      return await listOrgInvitations(
        { db: ctx.db, appBaseUrl: ctx.config.APP_BASE_URL },
        { organizationId: ctx.organization.id },
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  inviteCreate: organizationAdminProcedure
    .input(
      z.object({
        email: z.string().email().max(200),
        role: z.enum(['user', 'organization_admin']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOrgInvitation(
          {
            db: ctx.db,
            email: ctx.emailProvider,
            logger: ctx.logger,
            appBaseUrl: ctx.config.APP_BASE_URL,
          },
          {
            organizationId: ctx.organization.id,
            inviterUserId: ctx.user.id,
            email: input.email,
            role: input.role,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  inviteRevoke: organizationAdminProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await revokeOrgInvitation(
          { db: ctx.db, logger: ctx.logger },
          {
            organizationId: ctx.organization.id,
            invitationId: input.invitationId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  usagePerUser: organizationAdminProcedure.query(async ({ ctx }) => {
    try {
      return await listOrganizationPerUserSpend(
        { db: ctx.db },
        { organizationId: ctx.organization.id },
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  auditList: organizationAdminProcedure
    .input(
      z
        .object({
          action: z.string().min(1).max(60).nullable().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listOrganizationAuditEvents(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            action: input?.action ?? null,
            ...(input?.limit !== undefined ? { limit: input.limit } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
