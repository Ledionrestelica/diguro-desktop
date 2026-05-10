import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminPageBody } from '../AdminLayout';

/**
 * Org-admin audit log. Every security-relevant action (resource upload /
 * replace / delete, folder mutations, user role changes) is appended to
 * the `audit_events` table; this page reads back the most recent N
 * events, optionally filtered by action name.
 */
export function AuditLogPage() {
  const [action, setAction] = useState<string>('');
  const query = trpc.adminOrganization.auditList.useQuery({
    limit: 200,
    ...(action ? { action } : {}),
  });

  const rows = query.data ?? [];

  return (
    <AdminPageBody>
      <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 p-6">
          <div>
            <p className="text-sm font-medium leading-5 text-black">Audit log</p>
            <p className="mt-1 text-sm text-zinc-500">
              Every resource and member change, newest first. Append-only.
            </p>
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-10 rounded-[10px] border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none"
          >
            <option value="">All actions</option>
            <option value="resource.uploaded">Resource uploaded</option>
            <option value="resource.replaced">Resource replaced</option>
            <option value="resource.deleted">Resource deleted</option>
          </select>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">
                  No events match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 align-top">
                <Td>{formatRelativeTime(new Date(r.createdAt))}</Td>
                <Td>{r.userName ?? r.userEmail ?? '—'}</Td>
                <Td>
                  <ActionBadge action={r.action} />
                </Td>
                <Td mono>
                  {r.targetType && r.targetId
                    ? `${r.targetType}:${r.targetId.slice(0, 8)}…`
                    : '—'}
                </Td>
                <Td>
                  <MetadataPreview metadata={r.metadata} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </AdminPageBody>
  );
}

function MetadataPreview({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') return <span className="text-zinc-400">—</span>;
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-zinc-400">—</span>;
  // Show up to 3 key/value pairs inline.
  const preview = entries.slice(0, 3).map(([k, v]) => {
    const value =
      typeof v === 'string' && v.length > 40 ? v.slice(0, 37) + '…' : String(v);
    return `${k}=${value}`;
  });
  return (
    <span className="font-mono text-[12px] text-zinc-500">{preview.join(' · ')}</span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color = actionColor(action);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {action}
    </span>
  );
}

function actionColor(action: string): string {
  if (action.endsWith('.deleted')) return 'border-red-200 bg-red-50 text-red-700';
  if (action.endsWith('.replaced')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (action.endsWith('.uploaded') || action.endsWith('.created'))
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left font-medium">{children}</th>;
}

function Td({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td className={`px-6 py-3 text-zinc-700 ${mono ? 'font-mono text-[13px]' : ''}`}>
      {children}
    </td>
  );
}

function formatRelativeTime(date: Date): string {
  const delta = (Date.now() - date.getTime()) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)}d ago`;
  return date.toLocaleDateString();
}
