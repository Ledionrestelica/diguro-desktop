import { and, desc, eq, gte, schema, sql, type Db } from '@diguro/db';

/**
 * Usage queries for the org-admin dashboard. Usage is keyed on userId (+
 * optional workspaceId); rolling up to an organization means joining
 * tokenUsage → users → organizationId.
 */

export interface UsageStatsRow {
  type: typeof schema.usageType.enumValues[number];
  provider: string;
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costMicrodollars: number;
}

export interface UsageSummary {
  totalCostMicrodollars: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCalls: number;
  breakdown: UsageStatsRow[];
}

export interface RecentUsageRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  type: typeof schema.usageType.enumValues[number];
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costMicrodollars: number;
  createdAt: Date;
}

/**
 * Month-to-date summary for the whole organization. Breakdown row per
 * (type, provider, model) tuple — the UI renders this as a table below
 * the headline totals.
 */
export async function getOrganizationUsageSummary(
  deps: { db: Db },
  input: { organizationId: string; since?: Date },
): Promise<UsageSummary> {
  const since = input.since ?? startOfMonth(new Date());

  const rows = await deps.db
    .select({
      type: schema.tokenUsage.type,
      provider: schema.tokenUsage.provider,
      model: schema.tokenUsage.model,
      calls: sql<number>`count(*)::int`,
      promptTokens: sql<number>`coalesce(sum(${schema.tokenUsage.promptTokens}), 0)::bigint`,
      completionTokens: sql<number>`coalesce(sum(${schema.tokenUsage.completionTokens}), 0)::bigint`,
      costMicrodollars: sql<number>`coalesce(sum(${schema.tokenUsage.costMicrodollars}), 0)::bigint`,
    })
    .from(schema.tokenUsage)
    .innerJoin(schema.users, eq(schema.users.id, schema.tokenUsage.userId))
    .where(
      and(
        eq(schema.users.organizationId, input.organizationId),
        gte(schema.tokenUsage.createdAt, since),
      ),
    )
    .groupBy(
      schema.tokenUsage.type,
      schema.tokenUsage.provider,
      schema.tokenUsage.model,
    )
    .orderBy(desc(sql`sum(${schema.tokenUsage.costMicrodollars})`));

  const breakdown: UsageStatsRow[] = rows.map((r) => ({
    type: r.type,
    provider: r.provider,
    model: r.model,
    // Postgres aggregate sums come back as bigint / string; coerce to number
    // for the UI. Tokens and microdollars fit in JS safe integer range for
    // any realistic monthly volume.
    calls: Number(r.calls ?? 0),
    promptTokens: Number(r.promptTokens ?? 0),
    completionTokens: Number(r.completionTokens ?? 0),
    costMicrodollars: Number(r.costMicrodollars ?? 0),
  }));

  return {
    totalCostMicrodollars: breakdown.reduce((acc, r) => acc + r.costMicrodollars, 0),
    totalPromptTokens: breakdown.reduce((acc, r) => acc + r.promptTokens, 0),
    totalCompletionTokens: breakdown.reduce((acc, r) => acc + r.completionTokens, 0),
    totalCalls: breakdown.reduce((acc, r) => acc + r.calls, 0),
    breakdown,
  };
}

export async function listRecentOrganizationUsage(
  deps: { db: Db },
  input: { organizationId: string; limit?: number },
): Promise<RecentUsageRow[]> {
  const limit = Math.min(input.limit ?? 50, 200);
  const rows = await deps.db
    .select({
      id: schema.tokenUsage.id,
      userId: schema.tokenUsage.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      type: schema.tokenUsage.type,
      provider: schema.tokenUsage.provider,
      model: schema.tokenUsage.model,
      promptTokens: schema.tokenUsage.promptTokens,
      completionTokens: schema.tokenUsage.completionTokens,
      costMicrodollars: schema.tokenUsage.costMicrodollars,
      createdAt: schema.tokenUsage.createdAt,
    })
    .from(schema.tokenUsage)
    .innerJoin(schema.users, eq(schema.users.id, schema.tokenUsage.userId))
    .where(eq(schema.users.organizationId, input.organizationId))
    .orderBy(desc(schema.tokenUsage.createdAt))
    .limit(limit);
  return rows;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
