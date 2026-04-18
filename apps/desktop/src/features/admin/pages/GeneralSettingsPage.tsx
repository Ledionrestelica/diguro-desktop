import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAdminSave } from '../admin-save-context';
import { AdminPageBody } from '../AdminLayout';
import { LogoUploader } from '../LogoUploader';

/**
 * General tab — edits the ACTIVE WORKSPACE's branding (name, description,
 * logo). Gated by workspaceAdminProcedure on the server, so OWNER / ADMIN
 * members + superadmin / organization_admin all pass.
 */
export function GeneralSettingsPage() {
  const wsQuery = trpc.adminWorkspace.workspaceGet.useQuery();
  const update = trpc.adminWorkspace.workspaceUpdateBranding.useMutation();
  const presign = trpc.adminWorkspace.workspaceLogoPresignUpload.useMutation();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!wsQuery.data) return;
    setName(wsQuery.data.name);
    setDescription(wsQuery.data.description ?? '');
  }, [wsQuery.data]);

  const dirty = useMemo(() => {
    if (!wsQuery.data) return false;
    return (
      name !== wsQuery.data.name ||
      (description || null) !== (wsQuery.data.description ?? null)
    );
  }, [wsQuery.data, name, description]);

  const saveAction = useMemo(
    () => ({
      label: 'Save changes',
      disabled: !dirty,
      pending: update.isPending,
      onSave: () => {
        if (!wsQuery.data) return;
        update.mutate(
          {
            name: name !== wsQuery.data.name ? name : undefined,
            description:
              (description || null) !== (wsQuery.data.description ?? null)
                ? description || null
                : undefined,
          },
          {
            onSuccess: () => {
              void utils.adminWorkspace.workspaceGet.invalidate();
              void utils.health.me.invalidate();
              void utils.workspaces.myList.invalidate();
            },
          },
        );
      },
    }),
    [wsQuery.data, name, description, dirty, update, utils],
  );
  useAdminSave(saveAction);

  if (wsQuery.isLoading) {
    return <AdminPageBody>Loading…</AdminPageBody>;
  }
  if (wsQuery.error || !wsQuery.data) {
    return (
      <AdminPageBody>
        <p className="text-sm text-red-600">
          {wsQuery.error?.message ?? 'Could not load workspace.'}
        </p>
      </AdminPageBody>
    );
  }

  const ws = wsQuery.data;

  const onLogoChanged = () => {
    void utils.adminWorkspace.workspaceGet.invalidate();
    void utils.health.me.invalidate();
    void utils.workspaces.myList.invalidate();
  };

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-8">
        <LogoUploader
          logoUrl={ws.logoUrl}
          glyphSeed={ws.id}
          onPresign={async (file) => {
            const res = await presign.mutateAsync({
              filename: file.name,
              contentType: file.type,
              contentLength: file.size,
            });
            return res;
          }}
          onCommit={async (url) => {
            await update.mutateAsync({ logoUrl: url });
          }}
          onChanged={onLogoChanged}
        />

        <Field label="Workspace name" hint="Displayed in the top bar and the workspace picker.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-[420px] rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none focus:border-zinc-400"
          />
        </Field>

        <Field label="Description" hint="Shown on the workspace picker and to new members.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="What is this workspace for?"
            className="w-full max-w-[520px] resize-none rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none focus:border-zinc-400"
          />
        </Field>

        <LimitsCard workspace={ws} />

        {update.error && (
          <p className="text-sm text-red-600">
            {(update.error as { message: string }).message}
          </p>
        )}
      </div>
    </AdminPageBody>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-black">{label}</p>
        {hint && <p className="text-sm font-medium text-zinc-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function LimitsCard({
  workspace,
}: {
  workspace: {
    maxMembers: number;
    maxResources: number;
    memberCount: number;
  };
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-black">Plan limits</p>
        <p className="text-sm font-medium text-zinc-600">
          Contact your organization admin to raise these.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LimitTile
          label="Members"
          current={workspace.memberCount}
          cap={workspace.maxMembers}
        />
        <LimitTile label="Files" current={null} cap={workspace.maxResources} />
      </div>
    </section>
  );
}

function LimitTile({
  label,
  current,
  cap,
}: {
  label: string;
  current: number | null;
  cap: number;
}) {
  const pct = current !== null ? Math.min(100, Math.round((current / cap) * 100)) : 0;
  return (
    <div className="rounded-[10px] border border-zinc-200 bg-white p-4 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">
        {current ?? '—'}
        <span className="text-sm font-normal text-zinc-500"> / {cap}</span>
      </p>
      {current !== null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-800 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
