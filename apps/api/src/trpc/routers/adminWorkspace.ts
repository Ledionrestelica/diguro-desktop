import { and, asc, eq, schema, sql } from '@diguro/db';
import { z } from 'zod';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';
import { workspaceAdminProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import {
  deleteWorkspaceAttachment,
  MAX_WORKSPACE_LOGO_BYTES,
  presignWorkspaceLogo,
  resolveWorkspaceLogoUrl,
} from '../../services/workspaces/attachments.ts';
import { MAX_RESOURCE_BYTES } from '../../services/resources/organizationFiles.ts';
import {
  confirmWorkspaceResourceReplace,
  confirmWorkspaceResourceUpload,
  initiateWorkspaceResourceReplace,
  initiateWorkspaceResourceUpload,
  listWorkspaceResources,
  moveWorkspaceResource,
  removeWorkspaceResource,
} from '../../services/resources/workspaceFiles.ts';
import {
  createWorkspaceFolder,
  deleteWorkspaceFolder,
  ensureWorkspaceFolder,
  listWorkspaceFolders,
  moveWorkspaceFolder,
  renameWorkspaceFolder,
} from '../../services/resources/folders.ts';

const LogoUrlShape = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) => s.startsWith('workspace://') || /^https?:\/\//.test(s),
    'must be a workspace:// or https URL',
  );

/**
 * Workspace-admin router. Every procedure is scoped to ctx.workspace.
 * Gated by workspaceAdminProcedure — OWNER/ADMIN members or platform
 * admins (superadmin / organization_admin).
 */
export const adminWorkspaceRouter = router({
  workspaceGet: workspaceAdminProcedure.query(async ({ ctx }) => {
    try {
      const [counts] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.members)
        .where(eq(schema.members.workspaceId, ctx.workspace.id));

      let logoUrl = ctx.workspace.logoUrl;
      if (logoUrl?.startsWith('workspace://')) {
        logoUrl = await resolveWorkspaceLogoUrl(
          { objectStore: ctx.objectStore },
          { workspaceId: ctx.workspace.id, url: logoUrl },
        ).catch(() => null);
      }

      return {
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        slug: ctx.workspace.slug,
        description: ctx.workspace.description,
        logoUrl,
        backgroundColor: ctx.workspace.backgroundColor,
        buttonColor: ctx.workspace.buttonColor,
        systemPrompt: ctx.workspace.systemPrompt,
        tone: ctx.workspace.tone,
        defaultChatModelId: ctx.workspace.defaultChatModelId,
        defaultRewriteModelId: ctx.workspace.defaultRewriteModelId,
        allowedModelIds: ctx.workspace.allowedModelIds,
        maxMembers: ctx.workspace.maxMembers,
        maxResources: ctx.workspace.maxResources,
        createdAt: ctx.workspace.createdAt,
        memberCount: counts?.n ?? 0,
        myRole: ctx.workspaceMember?.role ?? null,
      };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  workspaceUpdateBranding: workspaceAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        logoUrl: LogoUrlShape.nullable().optional(),
        backgroundColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
        buttonColor: z
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
        if (input.description !== undefined) update['description'] = input.description;
        if (input.logoUrl !== undefined) update['logoUrl'] = input.logoUrl;
        if (input.backgroundColor !== undefined)
          update['backgroundColor'] = input.backgroundColor;
        if (input.buttonColor !== undefined) update['buttonColor'] = input.buttonColor;
        if (Object.keys(update).length === 0) return { ok: true as const };

        const oldRow =
          input.logoUrl !== undefined
            ? (
                await ctx.db
                  .select({ logoUrl: schema.workspaces.logoUrl })
                  .from(schema.workspaces)
                  .where(eq(schema.workspaces.id, ctx.workspace.id))
                  .limit(1)
              )[0]
            : undefined;

        await ctx.db
          .update(schema.workspaces)
          .set(update)
          .where(eq(schema.workspaces.id, ctx.workspace.id));

        if (oldRow?.logoUrl && oldRow.logoUrl !== input.logoUrl) {
          await deleteWorkspaceAttachment(
            { objectStore: ctx.objectStore },
            { workspaceId: ctx.workspace.id, url: oldRow.logoUrl },
          ).catch((err: unknown) => {
            ctx.logger.warn('failed to delete previous workspace logo', {
              workspaceId: ctx.workspace.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  workspaceLogoPresignUpload: workspaceAdminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_WORKSPACE_LOGO_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await presignWorkspaceLogo(
          { objectStore: ctx.objectStore },
          {
            workspaceId: ctx.workspace.id,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  membersList: workspaceAdminProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.db
        .select({
          memberId: schema.members.id,
          role: schema.members.role,
          userId: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          createdAt: schema.members.createdAt,
        })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
        .where(eq(schema.members.workspaceId, ctx.workspace.id))
        .orderBy(asc(schema.members.createdAt));
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  memberSetRole: workspaceAdminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Superadmins are blocked at the procedure level. Only org_admin
        // has the cross-workspace escalation here.
        const isPlatformAdmin = ctx.user.role === 'organization_admin';
        const myRole = ctx.workspaceMember?.role;

        if (!isPlatformAdmin && input.role === 'OWNER' && myRole !== 'OWNER') {
          throw new Forbidden('Only owners can assign the OWNER role');
        }

        const targetRows = await ctx.db
          .select({ id: schema.members.id, role: schema.members.role })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.workspaceId, ctx.workspace.id),
              eq(schema.members.userId, input.userId),
            ),
          )
          .limit(1);
        const target = targetRows[0];
        if (!target) throw new ResourceNotFound(input.userId);

        if (!isPlatformAdmin && target.role === 'OWNER' && myRole !== 'OWNER') {
          throw new Forbidden('Only owners can change an owner');
        }

        await ctx.db
          .update(schema.members)
          .set({ role: input.role })
          .where(eq(schema.members.id, target.id));

        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  memberRemove: workspaceAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.userId === ctx.user.id) {
          throw new Forbidden('Cannot remove yourself — use "leave workspace" instead');
        }
        // Superadmins are blocked at the procedure level. Only org_admin
        // has the cross-workspace escalation here.
        const isPlatformAdmin = ctx.user.role === 'organization_admin';

        const targetRows = await ctx.db
          .select({ id: schema.members.id, role: schema.members.role })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.workspaceId, ctx.workspace.id),
              eq(schema.members.userId, input.userId),
            ),
          )
          .limit(1);
        const target = targetRows[0];
        if (!target) throw new ResourceNotFound(input.userId);

        if (
          !isPlatformAdmin &&
          target.role === 'OWNER' &&
          ctx.workspaceMember?.role !== 'OWNER'
        ) {
          throw new Forbidden('Only owners can remove an owner');
        }

        await ctx.db.delete(schema.members).where(eq(schema.members.id, target.id));
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /* === Workspace files === */

  filesList: workspaceAdminProcedure
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
        return await listWorkspaceResources(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            ...(input?.search ? { search: input.search } : {}),
            ...(input && 'folderId' in input ? { folderId: input.folderId ?? null } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesInitiateUpload: workspaceAdminProcedure
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
        return await initiateWorkspaceResourceUpload(
          { db: ctx.db, objectStore: ctx.objectStore },
          {
            workspaceId: ctx.workspace.id,
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

  filesConfirmUpload: workspaceAdminProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmWorkspaceResourceUpload(
          { db: ctx.db, queue: ctx.queue, logger: ctx.logger },
          {
            workspaceId: ctx.workspace.id,
            versionId: input.versionId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesRemove: workspaceAdminProcedure
    .input(z.object({ resourceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await removeWorkspaceResource(
          { db: ctx.db, objectStore: ctx.objectStore, logger: ctx.logger },
          {
            workspaceId: ctx.workspace.id,
            resourceId: input.resourceId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesInitiateReplace: workspaceAdminProcedure
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
        return await initiateWorkspaceResourceReplace(
          { db: ctx.db, objectStore: ctx.objectStore },
          {
            workspaceId: ctx.workspace.id,
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

  filesConfirmReplace: workspaceAdminProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmWorkspaceResourceReplace(
          { db: ctx.db, queue: ctx.queue, logger: ctx.logger },
          {
            workspaceId: ctx.workspace.id,
            versionId: input.versionId,
            actorUserId: ctx.user.id,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesMove: workspaceAdminProcedure
    .input(
      z.object({
        resourceId: z.string().min(1),
        folderId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await moveWorkspaceResource(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            resourceId: input.resourceId,
            folderId: input.folderId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /* === Workspace folders === */

  foldersList: workspaceAdminProcedure.query(async ({ ctx }) => {
    try {
      return await listWorkspaceFolders(
        { db: ctx.db },
        { workspaceId: ctx.workspace.id },
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  folderCreate: workspaceAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        parentId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createWorkspaceFolder(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            name: input.name,
            parentId: input.parentId ?? null,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderEnsure: workspaceAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        parentId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ensureWorkspaceFolder(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            name: input.name,
            parentId: input.parentId ?? null,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderRename: workspaceAdminProcedure
    .input(
      z.object({
        folderId: z.string().min(1),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await renameWorkspaceFolder(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            folderId: input.folderId,
            name: input.name,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderMove: workspaceAdminProcedure
    .input(
      z.object({
        folderId: z.string().min(1),
        parentId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await moveWorkspaceFolder(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            folderId: input.folderId,
            parentId: input.parentId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  folderDelete: workspaceAdminProcedure
    .input(z.object({ folderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteWorkspaceFolder(
          { db: ctx.db },
          {
            workspaceId: ctx.workspace.id,
            folderId: input.folderId,
          },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
