import { and, eq, schema } from '@diguro/db';
import { z } from 'zod';
import { ResourceNotFound } from '@diguro/shared/errors';
import { router, systemAdminProcedure } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { createOrganization } from '../../services/organizations/create.ts';
import { getOrganization, listOrganizations } from '../../services/organizations/list.ts';
import { deleteOrganization, updateOrganization } from '../../services/organizations/update.ts';

const SlugShape = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, and dashes only');

export const adminPlatformRouter = router({
  /** List every organization (tenant). Used on /admin/platform home. */
  organizationsList: systemAdminProcedure.query(async ({ ctx }) => {
    try {
      return await listOrganizations({ db: ctx.db });
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
        return o;
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

  /** Assign or unassign a user to an organization. */
  userAssignOrganization: systemAdminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        organizationId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await ctx.db
          .update(schema.users)
          .set({ organizationId: input.organizationId, updatedAt: new Date() })
          .where(eq(schema.users.id, input.userId))
          .returning({ id: schema.users.id });
        if (res.length === 0) throw new ResourceNotFound(input.userId);
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
