import { eq, schema, type Db } from '@diguro/db';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';

/**
 * Self-serve organization creation from onboarding. The caller becomes the
 * organization's admin, and a first workspace named after the organization
 * is created with them as OWNER and set as the session's active workspace —
 * so the app is usable the moment onboarding ends. More workspaces are an
 * in-app concern.
 */

export interface CreateOwnOrganizationInput {
  userId: string;
  sessionId: string;
  name: string;
}

export async function createOwnOrganization(
  deps: { db: Db },
  input: CreateOwnOrganizationInput,
): Promise<{ organizationId: string; workspaceId: string }> {
  const name = input.name.trim();
  const organizationId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();

  await deps.db.transaction(async (tx) => {
    const [user] = await tx
      .select({ organizationId: schema.users.organizationId, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId))
      .for('update')
      .limit(1);
    if (!user) throw new ResourceNotFound(input.userId);
    if (user.organizationId) {
      throw new Forbidden('You already belong to an organization.');
    }

    await tx.insert(schema.organizations).values({
      id: organizationId,
      name,
      slug: await uniqueOrganizationSlug(tx, name),
    });
    await tx.insert(schema.workspaces).values({
      id: workspaceId,
      organizationId,
      name,
      slug: slugify(name) || 'general',
    });
    await tx.insert(schema.members).values({
      id: crypto.randomUUID(),
      workspaceId,
      userId: input.userId,
      role: 'OWNER',
    });
    await tx
      .update(schema.users)
      .set({
        organizationId,
        // Superadmins keep their platform role; everyone else administers
        // the organization they just created.
        ...(user.role === 'superadmin' ? {} : { role: 'organization_admin' as const }),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, input.userId));
    await tx
      .update(schema.sessions)
      .set({ activeWorkspaceId: workspaceId, updatedAt: new Date() })
      .where(eq(schema.sessions.id, input.sessionId));
  });

  return { organizationId, workspaceId };
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function uniqueOrganizationSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name) || 'organization';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const taken = await tx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, candidate))
      .limit(1);
    if (taken.length === 0) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
