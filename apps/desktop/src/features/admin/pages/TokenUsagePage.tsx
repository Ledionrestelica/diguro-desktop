import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminPageBody } from '../AdminLayout';

/**
 * Org-admin dashboard for AI spend. Data is aggregated month-to-date
 * (UTC) across every user in the organization. Every call made by the
 * app (chat, embed, rerank, OCR, contextualize, title gen) is captured
 * in `token_usage` — this page is purely read-only.
 */
export function TokenUsagePage() {
  const summaryQuery = trpc.adminOrganization.usageSummary.useQuery();
  const recentQuery = trpc.adminOrganization.usageRecent.useQuery({ limit: 50 });
  const perUserQuery = trpc.adminOrganization.usagePerUser.useQuery();

  const summary = summaryQuery.data;
  const recent = recentQuery.data ?? [];
  const perUser = perUserQuery.data ?? [];

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
        <section className="rounded-[12px] border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium leading-5 text-black">
            Spend this month
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {monthLabel} · UTC · updated in real time
          </p>

          <div className="mt-6 grid grid-cols-4 gap-4">
            <Stat
              label="Total cost"
              value={formatUsd(summary?.totalCostMicrodollars ?? 0)}
              highlight
            />
            <Stat label="Calls" value={(summary?.totalCalls ?? 0).toLocaleString()} />
            <Stat
              label="Input tokens"
              value={(summary?.totalPromptTokens ?? 0).toLocaleString()}
            />
            <Stat
              label="Output tokens"
              value={(summary?.totalCompletionTokens ?? 0).toLocaleString()}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">
                Breakdown by model
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Sorted by cost. Every call from every user, grouped by provider + model.
              </p>
            </div>
          </div>
          <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <Th>Type</Th>
                <Th>Provider</Th>
                <Th>Model</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Input</Th>
                <Th align="right">Output</Th>
                <Th align="right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {summaryQuery.isLoading && (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!summaryQuery.isLoading &&
                summary?.breakdown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-zinc-500">
                      No usage yet this month.
                    </td>
                  </tr>
                )}
              {summary?.breakdown.map((row, i) => (
                <tr key={`${row.type}-${row.provider}-${row.model}-${i}`} className="border-t border-zinc-100">
                  <Td>
                    <TypeBadge type={row.type} />
                  </Td>
                  <Td>{row.provider}</Td>
                  <Td mono>{row.model}</Td>
                  <Td align="right">{row.calls.toLocaleString()}</Td>
                  <Td align="right">{row.promptTokens.toLocaleString()}</Td>
                  <Td align="right">{row.completionTokens.toLocaleString()}</Td>
                  <Td align="right" bold>
                    {formatUsd(row.costMicrodollars)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">
                Per-seat usage
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Each seat has its own AI budget this month. Users past 80% are
                highlighted; past 100% get blocked from new chats.
              </p>
            </div>
          </div>
          <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <Th>User</Th>
                <Th align="right">Used</Th>
                <Th align="right">Cap</Th>
                <Th>Progress</Th>
                <Th align="right">Remaining</Th>
              </tr>
            </thead>
            <tbody>
              {perUserQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!perUserQuery.isLoading && perUser.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">
                    No members yet.
                  </td>
                </tr>
              )}
              {perUser.map((u) => (
                <tr key={u.userId} className="border-t border-zinc-100">
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900">
                        {u.userName ?? u.userEmail ?? '—'}
                      </span>
                      {u.userName && u.userEmail && (
                        <span className="text-xs text-zinc-500">{u.userEmail}</span>
                      )}
                      {u.hasCustomCap && (
                        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-600">
                          Custom cap
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="right" bold>
                    {formatUsd(u.usedMicrodollars)}
                  </Td>
                  <Td align="right">{formatUsd(u.capMicrodollars)}</Td>
                  <Td>
                    <ProgressBar fraction={u.fractionUsed} />
                  </Td>
                  <Td align="right">
                    {formatUsd(
                      Math.max(0, u.capMicrodollars - u.usedMicrodollars),
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">Recent activity</p>
              <p className="mt-1 text-sm text-zinc-500">
                The 50 most recent API calls across your organization.
              </p>
            </div>
          </div>
          <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Type</Th>
                <Th>Model</Th>
                <Th align="right">Input</Th>
                <Th align="right">Output</Th>
                <Th align="right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {recentQuery.isLoading && (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!recentQuery.isLoading && recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-zinc-500">
                    No recent activity.
                  </td>
                </tr>
              )}
              {recent.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <Td>{formatRelativeTime(new Date(row.createdAt))}</Td>
                  <Td>
                    <span className="truncate">{row.userName ?? row.userEmail ?? '—'}</span>
                  </Td>
                  <Td>
                    <TypeBadge type={row.type} />
                  </Td>
                  <Td mono>
                    {row.provider}/{row.model}
                  </Td>
                  <Td align="right">{row.promptTokens.toLocaleString()}</Td>
                  <Td align="right">{row.completionTokens.toLocaleString()}</Td>
                  <Td align="right" bold>
                    {formatUsd(row.costMicrodollars)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </AdminPageBody>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.min(1, Math.max(0, fraction));
  const isOver = fraction >= 1;
  const isWarn = fraction >= 0.8;
  const color = isOver
    ? 'bg-red-500'
    : isWarn
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full ${color}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span
        className={`min-w-[40px] text-right text-xs font-medium ${
          isOver ? 'text-red-600' : isWarn ? 'text-amber-700' : 'text-zinc-600'
        }`}
      >
        {Math.round(fraction * 100)}%
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded-[10px] border border-black/10 bg-zinc-50 p-4'
          : 'rounded-[10px] border border-zinc-200 p-4'
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      className={`px-6 py-3 ${align === 'right' ? 'text-right' : 'text-left'} font-medium`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  bold,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  bold?: boolean;
}) {
  const cls = [
    'px-6 py-3 text-zinc-700',
    align === 'right' ? 'text-right' : '',
    mono ? 'font-mono text-[13px]' : '',
    bold ? 'font-semibold text-zinc-900' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <td className={cls}>{children}</td>;
}

function TypeBadge({ type }: { type: string }) {
  const color = typeColor(type);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {type}
    </span>
  );
}

function typeColor(type: string): string {
  switch (type) {
    case 'CHAT':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'EMBED':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'RERANK':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'OCR':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'CONTEXTUALIZE':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'TITLE':
      return 'border-zinc-200 bg-zinc-50 text-zinc-600';
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  }
}

function formatUsd(microdollars: number): string {
  const usd = microdollars / 1_000_000;
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

function formatRelativeTime(date: Date): string {
  const delta = (Date.now() - date.getTime()) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)}d ago`;
  return date.toLocaleDateString();
}
