import { z } from 'zod';
import { eq, schema } from '@diguro/db';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import {
  confirmUserResourceUpload,
  initiateUserResourceUpload,
  listUserResources,
  removeUserResource,
} from '../../services/resources/userFiles.ts';
import { MAX_RESOURCE_BYTES } from '../../services/resources/organizationFiles.ts';
import {
  isKnownChatModel,
  listAvailableModels,
  resolveDefaultModel,
} from '../../ai/model-catalog.ts';

/**
 * `me.*` — the signed-in user's own resources. Scope-isolated at the
 * service layer: every call is keyed on `ctx.user.id`, never crossing
 * into organization or other-user data.
 */
export const meRouter = router({
  filesList: authedProcedure
    .input(z.object({ search: z.string().max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        return await listUserResources(
          { db: ctx.db },
          {
            userId: ctx.user.id,
            ...(input?.search ? { search: input.search } : {}),
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesInitiateUpload: authedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_RESOURCE_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await initiateUserResourceUpload(
          { db: ctx.db, objectStore: ctx.objectStore },
          {
            userId: ctx.user.id,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
          },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesConfirmUpload: authedProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await confirmUserResourceUpload(
          { db: ctx.db, queue: ctx.queue, logger: ctx.logger },
          { userId: ctx.user.id, versionId: input.versionId },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  filesRemove: authedProcedure
    .input(z.object({ resourceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await removeUserResource(
          { db: ctx.db, objectStore: ctx.objectStore, logger: ctx.logger },
          { userId: ctx.user.id, resourceId: input.resourceId },
        );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Catalog of chat models the caller can pick from, plus the effective
   *  default (resolved from user pref → org default → catalog default).
   *  The client renders this in the ModelPicker and highlights `defaultId`
   *  when no explicit preference exists. */
  listAvailableModels: authedProcedure.query(async ({ ctx }) => {
    try {
      const available = listAvailableModels(ctx.config);
      const row = await ctx.db
        .select({ preferred: schema.users.preferredChatModelId })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.user.id))
        .limit(1);
      const userPreferredId = row[0]?.preferred ?? null;
      const def = resolveDefaultModel(ctx.config, { userPreferredId });
      return {
        models: available,
        defaultId: def?.id ?? null,
        userPreferredId,
      };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  setPreferredModel: authedProcedure
    .input(z.object({ modelId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.modelId && !isKnownChatModel(input.modelId)) {
          throw new Error(`Unknown chat model: ${input.modelId}`);
        }
        await ctx.db
          .update(schema.users)
          .set({ preferredChatModelId: input.modelId, updatedAt: new Date() })
          .where(eq(schema.users.id, ctx.user.id));
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
