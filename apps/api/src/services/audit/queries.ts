import { and, desc, eq, schema, type Db } from '@diguro/db';

export interface AuditEventRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: Date;
}

/**
 * List audit events scoped to an organization. "Scoped" here means: the
 * actor is a user of the organization. System events (userId = null) are
 * skipped — org admins don't need to see reconciliation noise.
 */
export async function listOrganizationAuditEvents(
  deps: { db: Db },
  input: { organizationId: string; action?: string | null; limit?: number },
): Promise<AuditEventRow[]> {
  const limit = Math.min(input.limit ?? 100, 500);
  const orgFilter = eq(schema.users.organizationId, input.organizationId);
  const whereClause = input.action
    ? and(orgFilter, eq(schema.auditEvents.action, input.action))
    : orgFilter;

  const rows = await deps.db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      targetType: schema.auditEvents.targetType,
      targetId: schema.auditEvents.targetId,
      metadata: schema.auditEvents.metadata,
      userId: schema.auditEvents.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      createdAt: schema.auditEvents.createdAt,
    })
    .from(schema.auditEvents)
    .innerJoin(schema.users, eq(schema.users.id, schema.auditEvents.userId))
    .where(whereClause)
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(limit);
  return rows;
}
