import { z } from 'zod';
import { and, desc, eq, ne, schema } from '@diguro/db';
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
  AVATAR_URL_SCHEME,
  deleteUserAvatar,
  MAX_AVATAR_BYTES,
  presignUserAvatar,
  resolveUserAvatarUrl,
} from '../../services/users/attachments.ts';
import {
  isKnownChatModel,
  listAvailableModels,
  resolveDefaultModel,
} from '../../ai/model-catalog.ts';

const AvatarUrlShape = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) => s.startsWith(AVATAR_URL_SCHEME) || /^https?:\/\//.test(s),
    'must be an avatar:// or https URL',
  );

/**
 * `me.*` — the signed-in user's own resources. Scope-isolated at the
 * service layer: every call is keyed on `ctx.user.id`, never crossing
 * into organization or other-user data.
 */
export const meRouter = router({
  /** The caller's editable profile (Personal settings tab). `image` is
   *  resolved to a presigned https URL when it's an `avatar://` reference. */
  profileGet: authedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({
          name: schema.users.name,
          email: schema.users.email,
          image: schema.users.image,
        })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.user.id))
        .limit(1);
      const row = rows[0];
      let image = row?.image ?? null;
      if (image?.startsWith(AVATAR_URL_SCHEME)) {
        image = await resolveUserAvatarUrl(
          { objectStore: ctx.objectStore },
          { userId: ctx.user.id, url: image },
        ).catch(() => null);
      }
      return {
        name: row?.name ?? '',
        email: row?.email ?? ctx.user.email,
        image,
      };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  /** Update the caller's own profile. `name` trims; `image` accepts an
   *  `avatar://` reference (committed after a presigned upload) or null to
   *  clear. Replacing/clearing the avatar best-effort deletes the old S3
   *  object. */
  updateProfile: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120).optional(),
        image: AvatarUrlShape.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const update: Record<string, unknown> = {};
        if (input.name !== undefined) update['name'] = input.name.trim();
        if (input.image !== undefined) update['image'] = input.image;
        if (Object.keys(update).length === 0) return { ok: true as const };
        update['updatedAt'] = new Date();

        const oldRow =
          input.image !== undefined
            ? (
                await ctx.db
                  .select({ image: schema.users.image })
                  .from(schema.users)
                  .where(eq(schema.users.id, ctx.user.id))
                  .limit(1)
              )[0]
            : undefined;

        await ctx.db
          .update(schema.users)
          .set(update)
          .where(eq(schema.users.id, ctx.user.id));

        if (oldRow?.image && oldRow.image !== input.image) {
          await deleteUserAvatar(
            { objectStore: ctx.objectStore },
            { userId: ctx.user.id, url: oldRow.image },
          ).catch((err: unknown) => {
            ctx.logger.warn('failed to delete previous avatar', {
              userId: ctx.user.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Active sessions for the caller (Security settings tab). The session
   *  backing the current request is flagged so the client can label it and
   *  prevent self-revocation. */
  sessionsList: authedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({
          id: schema.sessions.id,
          ipAddress: schema.sessions.ipAddress,
          userAgent: schema.sessions.userAgent,
          createdAt: schema.sessions.createdAt,
          expiresAt: schema.sessions.expiresAt,
        })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, ctx.user.id))
        .orderBy(desc(schema.sessions.createdAt));
      return rows.map((r) => ({ ...r, isCurrent: r.id === ctx.session.id }));
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  /** Revoke one other session by deleting its row (Better-Auth validates the
   *  token against the DB, so the deleted session stops authenticating
   *  immediately). The current session can't be revoked here — sign out
   *  instead. Scoped to the caller's own sessions. */
  revokeSession: authedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.sessionId === ctx.session.id) {
          throw new Error('Cannot revoke the current session; sign out instead.');
        }
        await ctx.db
          .delete(schema.sessions)
          .where(
            and(
              eq(schema.sessions.id, input.sessionId),
              eq(schema.sessions.userId, ctx.user.id),
            ),
          );
        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /** Sign out everywhere else — revoke every session except the current one. */
  revokeOtherSessions: authedProcedure.mutation(async ({ ctx }) => {
    try {
      await ctx.db
        .delete(schema.sessions)
        .where(
          and(
            eq(schema.sessions.userId, ctx.user.id),
            ne(schema.sessions.id, ctx.session.id),
          ),
        );
      return { ok: true as const };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  avatarPresignUpload: authedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        contentLength: z.number().int().positive().max(MAX_AVATAR_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await presignUserAvatar(
          { objectStore: ctx.objectStore },
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

  /** Save the caller's free-text "how should the AI behave" instructions.
   *  Injected into the chat system prompt on every turn (see chat-route).
   *  Empty/whitespace-only clears it back to null. Capped to keep the
   *  prompt budget bounded. */
  setCustomInstructions: authedProcedure
    .input(z.object({ instructions: z.string().max(4000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const trimmed = input.instructions.trim();
        await ctx.db
          .update(schema.users)
          .set({
            customInstructions: trimmed.length > 0 ? trimmed : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, ctx.user.id));
        return { ok: true as const, customInstructions: trimmed.length > 0 ? trimmed : null };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
