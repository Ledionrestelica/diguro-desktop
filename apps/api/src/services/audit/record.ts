import { schema, type Db } from '@diguro/db';
import type { Logger } from '../../lib/logger.ts';

export interface RecordAuditInput {
  /** Actor. Null for system-initiated events (cron jobs, reconciliation). */
  userId: string | null;
  /** Organization scope. Audit events are joined to users → organization
   * when the admin UI needs org-scoped filtering. workspaceId captures
   * workspace-scoped actions; null means the action was cross-workspace. */
  workspaceId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an audit event. Same defensive posture as recordUsage — errors
 * are logged but never rethrown; audit logging is a side channel, not a
 * hard dependency of the action being audited.
 */
export async function recordAudit(
  deps: { db: Db; logger: Logger },
  input: RecordAuditInput,
): Promise<void> {
  try {
    await deps.db.insert(schema.auditEvents).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    deps.logger.warn('recordAudit failed', {
      action: input.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
