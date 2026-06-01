import { and, asc, eq, isNull, or, schema, type Db } from '@diguro/db';
import { ResourceNotFound } from '@diguro/shared/errors';

/**
 * Chat folders organise a user's conversations in the sidebar. Flat (no
 * nesting), scoped per user with an optional workspace tag that mirrors the
 * conversation scoping: a folder created in a workspace lives alongside that
 * workspace's chats; a personal folder (workspaceId null) sits with personal
 * chats. Listing includes null-workspace folders the same way the
 * conversation list surfaces legacy null-workspace threads.
 */

export interface ChatFolderRow {
  id: string;
  name: string;
  color: string | null;
  workspaceId: string | null;
  createdAt: Date;
}

export async function listChatFolders(
  deps: { db: Db },
  input: { userId: string; workspaceId: string | null },
): Promise<ChatFolderRow[]> {
  const scopeFilter =
    input.workspaceId === null
      ? isNull(schema.chatFolders.workspaceId)
      : or(
          eq(schema.chatFolders.workspaceId, input.workspaceId),
          isNull(schema.chatFolders.workspaceId),
        );

  return deps.db
    .select({
      id: schema.chatFolders.id,
      name: schema.chatFolders.name,
      color: schema.chatFolders.color,
      workspaceId: schema.chatFolders.workspaceId,
      createdAt: schema.chatFolders.createdAt,
    })
    .from(schema.chatFolders)
    .where(and(eq(schema.chatFolders.userId, input.userId), scopeFilter))
    .orderBy(asc(schema.chatFolders.name));
}

export async function createChatFolder(
  deps: { db: Db },
  input: { userId: string; workspaceId: string | null; name: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await deps.db.insert(schema.chatFolders).values({
    id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    name: input.name.trim(),
  });
  return { id };
}

export async function renameChatFolder(
  deps: { db: Db },
  input: { userId: string; folderId: string; name: string },
): Promise<void> {
  const res = await deps.db
    .update(schema.chatFolders)
    .set({ name: input.name.trim() })
    .where(
      and(
        eq(schema.chatFolders.id, input.folderId),
        eq(schema.chatFolders.userId, input.userId),
      ),
    )
    .returning({ id: schema.chatFolders.id });

  if (res.length === 0) throw new ResourceNotFound(input.folderId);
}

/** Set (or clear, when color is null) the folder's icon colour. */
export async function setChatFolderColor(
  deps: { db: Db },
  input: { userId: string; folderId: string; color: string | null },
): Promise<void> {
  const res = await deps.db
    .update(schema.chatFolders)
    .set({ color: input.color })
    .where(
      and(
        eq(schema.chatFolders.id, input.folderId),
        eq(schema.chatFolders.userId, input.userId),
      ),
    )
    .returning({ id: schema.chatFolders.id });

  if (res.length === 0) throw new ResourceNotFound(input.folderId);
}

/**
 * Deleting a folder never deletes its chats — they move back to the
 * ungrouped list (folderId cleared), then the folder row is removed.
 */
export async function deleteChatFolder(
  deps: { db: Db },
  input: { userId: string; folderId: string },
): Promise<void> {
  const owned = (
    await deps.db
      .select({ id: schema.chatFolders.id })
      .from(schema.chatFolders)
      .where(
        and(
          eq(schema.chatFolders.id, input.folderId),
          eq(schema.chatFolders.userId, input.userId),
        ),
      )
      .limit(1)
  )[0];
  if (!owned) throw new ResourceNotFound(input.folderId);

  await deps.db
    .update(schema.conversations)
    .set({ folderId: null })
    .where(
      and(
        eq(schema.conversations.folderId, input.folderId),
        eq(schema.conversations.userId, input.userId),
      ),
    );

  await deps.db
    .delete(schema.chatFolders)
    .where(
      and(
        eq(schema.chatFolders.id, input.folderId),
        eq(schema.chatFolders.userId, input.userId),
      ),
    );
}

/** Move a conversation into a folder, or out of any folder when folderId is null. */
export async function moveConversationToFolder(
  deps: { db: Db },
  input: { userId: string; conversationId: string; folderId: string | null },
): Promise<void> {
  if (input.folderId !== null) {
    const folder = (
      await deps.db
        .select({ id: schema.chatFolders.id })
        .from(schema.chatFolders)
        .where(
          and(
            eq(schema.chatFolders.id, input.folderId),
            eq(schema.chatFolders.userId, input.userId),
          ),
        )
        .limit(1)
    )[0];
    if (!folder) throw new ResourceNotFound(input.folderId);
  }

  const res = await deps.db
    .update(schema.conversations)
    .set({ folderId: input.folderId })
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.userId, input.userId),
      ),
    )
    .returning({ id: schema.conversations.id });

  if (res.length === 0) throw new ResourceNotFound(input.conversationId);
}
