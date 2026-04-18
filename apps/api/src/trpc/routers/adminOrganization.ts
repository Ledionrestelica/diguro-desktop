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
  confirmOrganizationResourceUpload,
  initiateOrganizationResourceUpload,
  listOrganizationResources,
  MAX_RESOURCE_BYTES,
  removeOrganizationResource,
} from '../../services/resources/organizationFiles.ts';

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
    .input(z.object({ search: z.string().max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        return await listOrganizationResources(
          { db: ctx.db },
          {
            organizationId: ctx.organization.id,
            ...(input?.search ? { search: input.search } : {}),
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
          { db: ctx.db, queue: ctx.queue },
          { organizationId: ctx.organization.id, versionId: input.versionId },
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
          { db: ctx.db, objectStore: ctx.objectStore },
          { organizationId: ctx.organization.id, resourceId: input.resourceId },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
