import { and, eq, schema, sql } from '@diguro/db';
import { z } from 'zod';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';
import { router, systemAdminProcedure } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { createOrganization } from '../../services/organizations/create.ts';
import { getOrganization, listOrganizations } from '../../services/organizations/list.ts';
import { deleteOrganization, updateOrganization } from '../../services/organizations/update.ts';
import {
  resolveOrganizationLogoUrl,
  ORGANIZATION_URL_SCHEME,
} from '../../services/organizations/attachments.ts';

const SlugShape = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, and dashes only');

export const adminPlatformRouter = router({
  /** List every organization (tenant). Used on /admin/platform home.
   *  Resolves any `organization://` logo URLs to presigned HTTPS URLs so
   *  the browser can render them — the in-storage scheme is opaque and
   *  blocked by CSP if surfaced to the renderer directly. */
  organizationsList: systemAdminProcedure.query(async ({ ctx }) => {
    try {
      const rows = await listOrganizations({ db: ctx.db });
      return await Promise.all(
        rows.map(async (row) => {
          if (!row.logoUrl?.startsWith(ORGANIZATION_URL_SCHEME)) return row;
          const resolved = await resolveOrganizationLogoUrl(
            { objectStore: ctx.objectStore },
            { organizationId: row.id, url: row.logoUrl },
          ).catch(() => null);
          return { ...row, logoUrl: resolved };
        }),
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  organizationGet: systemAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const o = await getOrganization({ db: ctx.db }, input.id);
        if (!o) throw new ResourceNotFound(input.id);
        if (!o.logoUrl?.startsWith(ORGANIZATION_URL_SCHEME)) return o;
        const resolved = await resolveOrganizationLogoUrl(
          { objectStore: ctx.objectStore },
          { organizationId: o.id, url: o.logoUrl },
        ).catch(() => null);
        return { ...o, logoUrl: resolved };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  organizationCreate: systemAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        slug: SlugShape,
        maxUsers: z.number().int().positive().max(10_000).optional(),
        maxWorkspaces: z.number().int().positive().max(1_000).optional(),
        maxResourcesPerWorkspace: z.number().int().positive().max(100_000).optional(),
        logoUrl: z.string().url().optional(),
        primaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOrganization({ db: ctx.db }, input);
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  organizationUpdate: systemAdminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        slug: SlugShape.optional(),
        maxUsers: z.number().int().positive().max(10_000).optional(),
        maxWorkspaces: z.number().int().positive().max(1_000).optional(),
        maxResourcesPerWorkspace: z.number().int().positive().max(100_000).optional(),
        logoUrl: z.string().url().nullable().optional(),
        primaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
        suspended: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await updateOrganization({ db: ctx.db }, input);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  organizationDelete: systemAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteOrganization({ db: ctx.db }, input);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Global user listing. Optional organizationId filter. */
  usersList: systemAdminProcedure
    .input(z.object({ organizationId: z.string().min(1).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const where = input?.organizationId
          ? and(eq(schema.users.organizationId, input.organizationId))
          : undefined;
        return await ctx.db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            role: schema.users.role,
            organizationId: schema.users.organizationId,
            banned: schema.users.banned,
            createdAt: schema.users.createdAt,
          })
          .from(schema.users)
          .where(where ?? undefined);
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Create a user directly with email + password. Admin-driven sign-up,
   *  bypassing the regular sign-up flow. The new user is created without
   *  a session — the admin's session is unchanged. Optionally attaches
   *  the user to an organization at creation time. */
  userCreate: systemAdminProcedure
    .input(
      z.object({
        email: z.string().email().toLowerCase(),
        password: z.string().min(8).max(128),
        name: z.string().min(1).max(120),
        role: z.enum(['superadmin', 'organization_admin', 'user']),
        organizationId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Better-Auth admin plugin creates the user without auto-signin
        // and without affecting the caller's session.
        const result = await ctx.auth.api.createUser({
          body: {
            email: input.email,
            password: input.password,
            name: input.name,
            role: input.role,
          },
          headers: ctx.req.headers,
        });

        const newUserId = result.user.id;

        // Belt-and-braces: explicitly set role + organizationId via DB,
        // since `additionalFields.input: false` on `organizationId` means
        // the auth API path won't write it for us.
        await ctx.db
          .update(schema.users)
          .set({
            role: input.role,
            organizationId: input.organizationId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, newUserId));

        return { id: newUserId, email: input.email };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  userSetRole: systemAdminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        role: z.enum(['superadmin', 'organization_admin', 'user']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await ctx.db
          .update(schema.users)
          .set({ role: input.role, updatedAt: new Date() })
          .where(eq(schema.users.id, input.userId))
          .returning({ id: schema.users.id });
        if (res.length === 0) throw new ResourceNotFound(input.userId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Assign or unassign a user to an organization. Also clears every
   *  workspace membership the user holds OUTSIDE the new org — those
   *  memberships would otherwise be orphan rows that surface in the
   *  workspace rail but fail at setActive (cross-org workspaces are
   *  forbidden). Done in one transaction so a failure rolls both back. */
  userAssignOrganization: systemAdminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        organizationId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.transaction(async (tx) => {
          const res = await tx
            .update(schema.users)
            .set({
              organizationId: input.organizationId,
              updatedAt: new Date(),
            })
            .where(eq(schema.users.id, input.userId))
            .returning({ id: schema.users.id });
          if (res.length === 0) throw new ResourceNotFound(input.userId);

          // Drop memberships for workspaces NOT in the target org. If
          // organizationId is null (unassigned), drop every membership.
          await tx.execute(sql`
            DELETE FROM ${schema.members}
            WHERE ${schema.members.userId} = ${input.userId}
              AND ${schema.members.workspaceId} IN (
                SELECT w.id FROM ${schema.workspaces} w
                WHERE ${
                  input.organizationId === null
                    ? sql`TRUE`
                    : sql`w.organization_id != ${input.organizationId}`
                }
              )
          `);

          // Clear activeWorkspaceId on every session of this user where
          // the active workspace lives in the OLD org — otherwise the
          // user's chat layout would still try to load the old workspace
          // on next render. Same logic as the membership cleanup above.
          await tx.execute(sql`
            UPDATE ${schema.sessions}
            SET active_organization_id = NULL
            WHERE ${schema.sessions.userId} = ${input.userId}
              AND ${schema.sessions.activeWorkspaceId} IS NOT NULL
              AND ${schema.sessions.activeWorkspaceId} IN (
                SELECT w.id FROM ${schema.workspaces} w
                WHERE ${
                  input.organizationId === null
                    ? sql`TRUE`
                    : sql`w.organization_id != ${input.organizationId}`
                }
              )
          `);
        });
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /**
   * Permanently delete a user from the platform. Cascades through every
   * FK that points at users.id (memberships, sessions, conversations,
   * personal resources, audit rows that reference them, etc.) via the
   * existing schema-level ON DELETE rules. Refuses self-deletion to
   * avoid an admin locking themselves out.
   */
  userDelete: systemAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.userId === ctx.user.id) {
          throw new Forbidden('You cannot delete your own account');
        }
        const res = await ctx.db
          .delete(schema.users)
          .where(eq(schema.users.id, input.userId))
          .returning({ id: schema.users.id });
        if (res.length === 0) throw new ResourceNotFound(input.userId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
