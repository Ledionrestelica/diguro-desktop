import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAdminSave } from '../admin-save-context';
import { AdminPageBody } from '../AdminPageBody';
import { LogoUploader } from '../LogoUploader';
import { SettingsRow, SettingsSection } from '../SettingsSection';
import { Input } from '@/components/ui/input';

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
      name !== wsQuery.data.name || (description || null) !== (wsQuery.data.description ?? null)
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
    return (
      <AdminPageBody>
        <p className="text-label-13 text-text-secondary">Loading…</p>
      </AdminPageBody>
    );
  }
  if (wsQuery.error || !wsQuery.data) {
    return (
      <AdminPageBody>
        <p className="text-label-13 text-danger-text">
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
      <SettingsSection title="Details">
        <LogoUploader
          logoUrl={ws.logoUrl}
          glyphSeed={ws.id}
          label="Icon"
          description="Shown in the sidebar, on the workspace picker and on its files."
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
        <SettingsRow label="Name" hint="Shown in the sidebar and the workspace picker.">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-[260px]" />
        </SettingsRow>
        <SettingsRow
          label="Description"
          hint="Helps the assistant and new members understand what this workspace is for."
          stacked
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="What is this workspace for?"
            className="w-full resize-none rounded-[10px] border border-border-input bg-bg-panel px-3 py-2.5 text-copy-14 text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-placeholder hover:border-border-hover focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Plan limits" note="Ask your organization admin to raise these.">
        <SettingsRow label="Files">
          <span className="text-label-13 font-medium text-text-secondary tabular-nums">
            Up to {ws.maxResources}
          </span>
        </SettingsRow>
      </SettingsSection>

      {update.error && (
        <p className="text-label-13 text-danger-text">
          {(update.error as { message: string }).message}
        </p>
      )}
    </AdminPageBody>
  );
}
