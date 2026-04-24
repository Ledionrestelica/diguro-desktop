import { and, desc, eq, gte, schema, sql, type Db } from '@diguro/db';
import { SpendingLimitExceeded } from '@diguro/shared/errors';

/**
 * Per-seat spending limits. Pricing model is per-seat with an included AI
 * budget: each user has a monthly cap that defaults to the organization's
 * `default_user_ai_budget_microdollars`, optionally overridden by an
 * explicit row in `spending_limits` (admin bumps a heavy user's cap).
 *
 * All values are microdollars (USD × 1,000,000). Month boundary is UTC —
 * the reset is at 00:00 UTC on the 1st of every month, same boundary the
 * dashboard uses.
 */

export interface UserUsageSnapshot {
  userId: string;
  capMicrodollars: number;
  usedMicrodollars: number;
  remainingMicrodollars: number;
  /** Fraction of the cap consumed, in [0, 1+]. Over 1 when the user is above cap. */
  fractionUsed: number;
  /** When the counter resets, ISO string. */
  resetsAt: string;
  /** True when `spending_limits.user_id` row exists — admin set a custom cap. */
  hasCustomCap: boolean;
  /** Org's default at the time of query, for context. */
  defaultCapMicrodollars: number;
}

export interface PerUserSpendRow {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  capMicrodollars: number;
  usedMicrodollars: number;
  fractionUsed: number;
  hasCustomCap: boolean;
}

/**
 * Resolve a user's effective monthly cap: prefer a custom spending_limits
 * row, otherwise fall back to the organization's default.
 */
export async function resolveUserCap(
  deps: { db: Db },
  input: { userId: string },
): Promise<{ capMicrodollars: number; defaultCapMicrodollars: number; hasCustomCap: boolean }> {
  const rows = await deps.db
    .select({
      customCap: schema.spendingLimits.monthlyCapMicrodollars,
      orgDefault: schema.organizations.defaultUserAiBudgetMicrodollars,
    })
    .from(schema.users)
    .leftJoin(
      schema.spendingLimits,
      eq(schema.spendingLimits.userId, schema.users.id),
    )
    .leftJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.users.organizationId),
    )
    .where(eq(schema.users.id, input.userId))
    .limit(1);

  const row = rows[0];
  // User without an organization falls back to $0 cap — they shouldn't be
  // making billable calls. Org-less users are typically unaffiliated
  // awaiting an invite; blocking their chat is the right outcome.
  const defaultCap = row?.orgDefault ? Number(row.orgDefault) : 0;
  const custom = row?.customCap ? Number(row.customCap) : null;
  return {
    capMicrodollars: custom ?? defaultCap,
    defaultCapMicrodollars: defaultCap,
    hasCustomCap: custom !== null,
  };
}

export async function getUserMonthToDateCost(
  deps: { db: Db },
  input: { userId: string; since?: Date },
): Promise<number> {
  const since = input.since ?? startOfMonth(new Date());
  const rows = await deps.db
    .select({
      total: sql<number>`coalesce(sum(${schema.tokenUsage.costMicrodollars}), 0)::bigint`,
    })
    .from(schema.tokenUsage)
    .where(
      and(
        eq(schema.tokenUsage.userId, input.userId),
        gte(schema.tokenUsage.createdAt, since),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Throws `SpendingLimitExceeded` when the user is already above their
 * effective monthly cap. We gate on the current total rather than trying
 * to predict the incoming call's cost — the expected small overshoot on
 * the last call is preferable to blocking borderline-valid calls.
 */
export async function assertUserWithinCap(
  deps: { db: Db },
  input: { userId: string },
): Promise<void> {
  const [cap, used] = await Promise.all([
    resolveUserCap(deps, input),
    getUserMonthToDateCost(deps, input),
  ]);
  // Cap of 0 means "no budget configured" — block to protect the platform
  // from a misconfigured user silently racking up cost.
  if (cap.capMicrodollars <= 0 || used >= cap.capMicrodollars) {
    throw new SpendingLimitExceeded(
      `Monthly AI budget exhausted (${formatUsd(used)} of ${formatUsd(cap.capMicrodollars)}). Resets on the 1st of next month.`,
    );
  }
}

/**
 * Snapshot for the user's own settings page.
 */
export async function getUserUsageSnapshot(
  deps: { db: Db },
  input: { userId: string },
): Promise<UserUsageSnapshot> {
  const [cap, used] = await Promise.all([
    resolveUserCap(deps, input),
    getUserMonthToDateCost(deps, input),
  ]);
  const remaining = Math.max(0, cap.capMicrodollars - used);
  const fractionUsed =
    cap.capMicrodollars > 0 ? used / cap.capMicrodollars : 0;
  return {
    userId: input.userId,
    capMicrodollars: cap.capMicrodollars,
    usedMicrodollars: used,
    remainingMicrodollars: remaining,
    fractionUsed,
    resetsAt: startOfNextMonth(new Date()).toISOString(),
    hasCustomCap: cap.hasCustomCap,
    defaultCapMicrodollars: cap.defaultCapMicrodollars,
  };
}

/**
 * Per-user spend rollup for the org-admin dashboard. Every member of the
 * organization appears in the result with their MTD cost and effective
 * cap, even if they haven't chatted this month (used = 0).
 */
export async function listOrganizationPerUserSpend(
  deps: { db: Db },
  input: { organizationId: string; since?: Date },
): Promise<PerUserSpendRow[]> {
  const since = input.since ?? startOfMonth(new Date());

  // One-shot query: every user in the org, their custom cap (if any), and
  // their MTD cost. LEFT JOIN on tokenUsage keeps users with zero usage.
  const rows = await deps.db
    .select({
      userId: schema.users.id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      customCap: schema.spendingLimits.monthlyCapMicrodollars,
      orgDefault: schema.organizations.defaultUserAiBudgetMicrodollars,
      usedMicrodollars: sql<number>`coalesce(sum(CASE WHEN ${schema.tokenUsage.createdAt} >= ${since} THEN ${schema.tokenUsage.costMicrodollars} ELSE 0 END), 0)::bigint`,
    })
    .from(schema.users)
    .leftJoin(
      schema.spendingLimits,
      eq(schema.spendingLimits.userId, schema.users.id),
    )
    .leftJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.users.organizationId),
    )
    .leftJoin(schema.tokenUsage, eq(schema.tokenUsage.userId, schema.users.id))
    .where(eq(schema.users.organizationId, input.organizationId))
    .groupBy(
      schema.users.id,
      schema.users.name,
      schema.users.email,
      schema.spendingLimits.monthlyCapMicrodollars,
      schema.organizations.defaultUserAiBudgetMicrodollars,
    )
    .orderBy(desc(sql`sum(CASE WHEN ${schema.tokenUsage.createdAt} >= ${since} THEN ${schema.tokenUsage.costMicrodollars} ELSE 0 END)`));

  return rows.map((r) => {
    const defaultCap = r.orgDefault ? Number(r.orgDefault) : 0;
    const custom = r.customCap ? Number(r.customCap) : null;
    const capMicrodollars = custom ?? defaultCap;
    const used = Number(r.usedMicrodollars ?? 0);
    const fractionUsed = capMicrodollars > 0 ? used / capMicrodollars : 0;
    return {
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      capMicrodollars,
      usedMicrodollars: used,
      fractionUsed,
      hasCustomCap: custom !== null,
    };
  });
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function formatUsd(microdollars: number): string {
  const usd = microdollars / 1_000_000;
  if (usd < 0.01) return '$0.00';
  return `$${usd.toFixed(2)}`;
}
