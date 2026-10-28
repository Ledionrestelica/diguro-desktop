import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminPageBody } from '../AdminPageBody';
import { DsBadge, type DsBadgeColor } from '@/components/ui/ds-badge';

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
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-label-14 font-semibold">Spend this month</h2>
            <p className="text-label-12 text-text-placeholder">
              {monthLabel} · UTC · updated in real time
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Total cost"
              value={formatUsd(summary?.totalCostMicrodollars ?? 0)}
              sub={monthLabel}
            />
            <Stat label="Calls" value={(summary?.totalCalls ?? 0).toLocaleString()} />
            <Stat label="Input tokens" value={(summary?.totalPromptTokens ?? 0).toLocaleString()} />
            <Stat
              label="Output tokens"
              value={(summary?.totalCompletionTokens ?? 0).toLocaleString()}
            />
          </div>
        </section>

        <TableSection
          title="Breakdown by model"
          note="Sorted by cost. Every call from every user, grouped by provider and model."
        >
          <table className="w-full min-w-[760px] text-label-14">
            <thead className="text-label-12 text-text-placeholder">
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
              {summaryQuery.isLoading && <MessageRow colSpan={7}>Loading…</MessageRow>}
              {!summaryQuery.isLoading && summary?.breakdown.length === 0 && (
                <MessageRow colSpan={7} tall>
                  No usage yet this month.
                </MessageRow>
              )}
              {summary?.breakdown.map((row, i) => (
                <tr
                  key={`${row.type}-${row.provider}-${row.model}-${i}`}
                  className="border-t border-border-default"
                >
                  <Td>
                    <TypeBadge type={row.type} />
                  </Td>
                  <Td muted>{row.provider}</Td>
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
        </TableSection>

        <TableSection
          title="Per-seat usage"
          note="Each seat has its own AI budget this month. Users past 80% are highlighted; past 100% get blocked from new chats."
        >
          <table className="w-full min-w-[760px] text-label-14">
            <thead className="text-label-12 text-text-placeholder">
              <tr>
                <Th>User</Th>
                <Th align="right">Used</Th>
                <Th align="right">Cap</Th>
                <Th>Progress</Th>
                <Th align="right">Remaining</Th>
              </tr>
            </thead>
            <tbody>
              {perUserQuery.isLoading && <MessageRow colSpan={5}>Loading…</MessageRow>}
              {!perUserQuery.isLoading && perUser.length === 0 && (
                <MessageRow colSpan={5} tall>
                  No members yet.
                </MessageRow>
              )}
              {perUser.map((u) => (
                <tr key={u.userId} className="border-t border-border-default">
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{u.userName ?? u.userEmail ?? '—'}</span>
                      {u.userName && u.userEmail && (
                        <span className="text-label-12 text-text-secondary">{u.userEmail}</span>
                      )}
                      {u.hasCustomCap && (
                        <DsBadge color="orange" className="mt-0.5">
                          Custom cap
                        </DsBadge>
                      )}
                    </div>
                  </Td>
                  <Td align="right" bold>
                    {formatUsd(u.usedMicrodollars)}
                  </Td>
                  <Td align="right" muted>
                    {formatUsd(u.capMicrodollars)}
                  </Td>
                  <Td>
                    <ProgressBar fraction={u.fractionUsed} />
                  </Td>
                  <Td align="right">
                    {formatUsd(Math.max(0, u.capMicrodollars - u.usedMicrodollars))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableSection>

        <TableSection
          title="Recent activity"
          note="The 50 most recent API calls across your organization."
        >
          <table className="w-full min-w-[760px] text-label-14">
            <thead className="text-label-12 text-text-placeholder">
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
              {recentQuery.isLoading && <MessageRow colSpan={7}>Loading…</MessageRow>}
              {!recentQuery.isLoading && recent.length === 0 && (
                <MessageRow colSpan={7} tall>
                  No recent activity.
                </MessageRow>
              )}
              {recent.map((row) => (
                <tr key={row.id} className="border-t border-border-default">
                  <Td muted>{formatRelativeTime(new Date(row.createdAt))}</Td>
                  <Td>
                    <span className="truncate font-medium">
                      {row.userName ?? row.userEmail ?? '—'}
                    </span>
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
        </TableSection>
      </div>
    </AdminPageBody>
  );
}

function TableSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-label-14 font-semibold">{title}</h2>
        <p className="text-label-13 text-text-secondary">{note}</p>
      </div>
      <div className="overflow-hidden rounded-[16px] border border-border-default">
        <div className="scrollbar-thin overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

function MessageRow({
  colSpan,
  tall,
  children,
}: {
  colSpan: number;
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`border-t border-border-default px-5 text-center text-text-secondary ${tall ? 'py-10' : 'py-6'}`}
      >
        {children}
      </td>
    </tr>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.min(1, Math.max(0, fraction));
  const isOver = fraction >= 1;
  const isWarn = fraction >= 0.8;
  const color = isOver ? 'bg-danger' : isWarn ? 'bg-warning' : 'bg-primary';
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-gray-3">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span
        className={`min-w-[40px] text-right text-label-13 font-medium tabular-nums ${
          isOver ? 'text-danger-text' : isWarn ? 'text-warning-text' : 'text-text-secondary'
        }`}
      >
        {Math.round(fraction * 100)}%
      </span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-[16px] border border-border-default px-[18px] py-4">
      <p className="text-label-13 font-medium text-text-secondary">{label}</p>
      <p className="mt-1 text-[24px] leading-8 font-semibold text-text tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-label-12 text-text-placeholder">{sub}</p>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-5 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  bold,
  muted,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  const cls = [
    'px-5 py-3',
    align === 'right' ? 'text-right tabular-nums' : '',
    mono
      ? 'font-mono text-label-13 text-text-secondary'
      : bold
        ? 'font-semibold text-text'
        : muted
          ? 'text-text-secondary'
          : 'text-text',
  ]
    .filter(Boolean)
    .join(' ');
  return <td className={cls}>{children}</td>;
}

function TypeBadge({ type }: { type: string }) {
  return <DsBadge color={typeColor(type)}>{type.toLowerCase()}</DsBadge>;
}

function typeColor(type: string): DsBadgeColor {
  switch (type) {
    case 'CHAT':
      return 'blue';
    case 'EMBED':
      return 'green';
    case 'RERANK':
      return 'orange';
    case 'OCR':
      return 'green';
    case 'CONTEXTUALIZE':
      return 'blue';
    default:
      return 'gray';
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
