import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminPageBody } from '../AdminPageBody';

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
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-label-13 text-text-secondary">
          Every file and member change, newest first. Events can’t be edited or removed.
        </p>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-8 shrink-0 cursor-pointer rounded-[10px] border border-border-default bg-bg-panel px-2.5 text-label-13 text-text outline-none transition-[border-color,box-shadow] hover:border-border-hover focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
        >
          <option value="">All actions</option>
          <option value="resource.uploaded">File uploaded</option>
          <option value="resource.replaced">File replaced</option>
          <option value="resource.deleted">File deleted</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-[16px] border border-border-default">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-label-14">
            <thead className="text-label-12 text-text-placeholder">
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td
                    colSpan={5}
                    className="border-t border-border-default px-5 py-6 text-center text-text-secondary"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="border-t border-border-default px-5 py-10 text-center text-text-secondary"
                  >
                    No events match this filter.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-default align-top">
                  <Td muted>{formatRelativeTime(new Date(r.createdAt))}</Td>
                  <Td>
                    <span className="font-medium whitespace-nowrap">
                      {r.userName ?? r.userEmail ?? '—'}
                    </span>
                  </Td>
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
  if (!metadata || typeof metadata !== 'object')
    return <span className="text-text-placeholder">—</span>;
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-text-placeholder">—</span>;
  // Show up to 3 key/value pairs inline.
  const preview = entries.slice(0, 3).map(([k, v]) => {
    const value = typeof v === 'string' && v.length > 40 ? v.slice(0, 37) + '…' : String(v);
    return `${k}=${value}`;
  });
  return <span className="font-mono text-label-12 text-text-secondary">{preview.join(' · ')}</span>;
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[6px] bg-bg-subtle px-2 py-0.5 text-label-12 font-medium ${actionColor(action)}`}
    >
      {action}
    </span>
  );
}

function actionColor(action: string): string {
  if (action.endsWith('.deleted')) return 'text-danger-text';
  if (action.endsWith('.replaced')) return 'text-warning-text';
  if (action.endsWith('.uploaded') || action.endsWith('.created')) return 'text-success-text';
  return 'text-text-secondary';
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-2.5 text-left font-medium">{children}</th>;
}

function Td({
  children,
  mono,
  muted,
}: {
  children: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-5 py-3 ${mono ? 'font-mono text-label-13 text-text-secondary' : muted ? 'text-text-secondary' : 'text-text'}`}
    >
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
