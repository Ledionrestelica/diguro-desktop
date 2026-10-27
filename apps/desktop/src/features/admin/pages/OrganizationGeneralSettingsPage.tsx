import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAdminSave } from '../admin-save-context';
import { AdminPageBody } from '../AdminPageBody';
import { LogoUploader } from '../LogoUploader';
import { BrandPreview } from '../BrandPreview';
import { SettingsRow, SettingsSection } from '../SettingsSection';
import { Input } from '@/components/ui/input';

/**
 * Settings · Organization · General (Figma "… v2 (Brand) - Use this"): logo
 * with a live preview of how members see it, the name, the read-only
 * address, and plan limits.
 * Gated server-side by organizationAdminProcedure — superadmins and
 * organization_admins pass.
 */
export function OrganizationGeneralSettingsPage() {
  const orgQuery = trpc.adminOrganization.organizationGet.useQuery();
  const update = trpc.adminOrganization.organizationUpdateBranding.useMutation();
  const presign = trpc.adminOrganization.logoPresignUpload.useMutation();
  const utils = trpc.useUtils();

  const workspaces = trpc.adminOrganization.workspacesList.useQuery();
  const [name, setName] = useState('');

  useEffect(() => {
    if (orgQuery.data) setName(orgQuery.data.name);
  }, [orgQuery.data]);

  const dirty = useMemo(
    () => !!orgQuery.data && name.trim().length > 0 && name !== orgQuery.data.name,
    [orgQuery.data, name],
  );

  const saveAction = useMemo(
    () => ({
      label: 'Save changes',
      disabled: !dirty,
      pending: update.isPending,
      onSave: () => {
        if (!orgQuery.data) return;
        update.mutate(
          { name },
          {
            onSuccess: () => {
              void utils.adminOrganization.organizationGet.invalidate();
              void utils.health.me.invalidate();
            },
          },
        );
      },
    }),
    [orgQuery.data, name, dirty, update, utils],
  );
  useAdminSave(saveAction);

  if (orgQuery.isLoading) {
    return (
      <AdminPageBody>
        <p className="text-label-13 text-text-secondary">Loading…</p>
      </AdminPageBody>
    );
  }
  if (orgQuery.error || !orgQuery.data) {
    return (
      <AdminPageBody>
        <p className="text-label-13 text-danger-text">
          {orgQuery.error?.message ?? 'Could not load organization.'}
        </p>
      </AdminPageBody>
    );
  }

  const org = orgQuery.data;

  const onLogoChanged = () => {
    void utils.adminOrganization.organizationGet.invalidate();
    void utils.health.me.invalidate();
  };

  return (
    <AdminPageBody>
      <SettingsSection title="Brand">
        <LogoUploader
          logoUrl={org.logoUrl}
          glyphSeed={org.id}
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
        <BrandPreview
          name={org.name}
          logoUrl={org.logoUrl}
          glyphSeed={org.id}
          workspaceNames={(workspaces.data ?? []).map((w) => w.name)}
        />
      </SettingsSection>

      <SettingsSection title="Details">
        <SettingsRow label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-[260px]" />
        </SettingsRow>
        <SettingsRow label="Address" hint="Used in invite links.">
          <Input value={org.slug} disabled readOnly className="h-8 w-[260px]" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Plan limits"
        note="Need more room? Contact us and we'll raise your limits."
      >
        <LimitRow label="Seats" current={org.userCount} cap={org.maxUsers} />
        <LimitRow label="Files per workspace" current={null} cap={org.maxResourcesPerWorkspace} />
        <LimitRow label="Workspaces" current={org.workspaceCount} cap={org.maxWorkspaces} />
      </SettingsSection>

      {update.error && (
        <p className="text-label-13 text-danger-text">
          {(update.error as { message: string }).message}
        </p>
      )}
    </AdminPageBody>
  );
}

function LimitRow({ label, current, cap }: { label: string; current: number | null; cap: number }) {
  const pct = current !== null ? Math.min(100, Math.round((current / cap) * 100)) : 0;
  return (
    <SettingsRow label={label}>
      <div className="flex items-center gap-3">
        {current !== null && (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-3">
            <div
              className={
                pct > 85 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-primary'
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <span className="w-[72px] text-right text-label-13 font-medium text-text-secondary tabular-nums">
          {current !== null ? `${current} of ${cap}` : `Up to ${cap}`}
        </span>
      </div>
    </SettingsRow>
  );
}
