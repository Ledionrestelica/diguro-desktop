import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAdminSave } from '../admin-save-context';
import { AdminPageBody } from '../AdminLayout';
import { LogoUploader } from '../LogoUploader';

/**
 * General tab for the organization (tenant). Edits name, slug, logo.
 * Gated server-side by organizationAdminProcedure — superadmins and
 * organization_admins pass.
 */
export function OrganizationGeneralSettingsPage() {
  const orgQuery = trpc.adminOrganization.organizationGet.useQuery();
  const update = trpc.adminOrganization.organizationUpdateBranding.useMutation();
  const presign = trpc.adminOrganization.logoPresignUpload.useMutation();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!orgQuery.data) return;
    setName(orgQuery.data.name);
    setSlug(orgQuery.data.slug);
  }, [orgQuery.data]);

  const dirty = useMemo(() => {
    if (!orgQuery.data) return false;
    return name !== orgQuery.data.name || slug !== orgQuery.data.slug;
  }, [orgQuery.data, name, slug]);

  const saveAction = useMemo(
    () => ({
      label: 'Save changes',
      disabled: !dirty,
      pending: update.isPending,
      onSave: () => {
        if (!orgQuery.data) return;
        update.mutate(
          {
            ...(name !== orgQuery.data.name ? { name } : {}),
            ...(slug !== orgQuery.data.slug ? { slug } : {}),
          },
          {
            onSuccess: () => {
              void utils.adminOrganization.organizationGet.invalidate();
              void utils.health.me.invalidate();
            },
          },
        );
      },
    }),
    [orgQuery.data, name, slug, dirty, update, utils],
  );
  useAdminSave(saveAction);

  if (orgQuery.isLoading) {
    return <AdminPageBody>Loading…</AdminPageBody>;
  }
  if (orgQuery.error || !orgQuery.data) {
    return (
      <AdminPageBody>
        <p className="text-sm text-red-600">
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
      <div className="flex flex-col gap-8">
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

        <Field
          label="Organization name"
          hint="The tenant name. Shown on the workspace picker and wherever the organization is referenced."
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-[420px] rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none focus:border-zinc-400"
          />
        </Field>

        <Field
          label="Slug"
          hint="Lowercase, dashes allowed. Used in URLs and internal references."
        >
          <input
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }
            className="w-full max-w-[420px] rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none focus:border-zinc-400"
          />
        </Field>

        <LimitsCard org={org} />

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
  org,
}: {
  org: {
    maxUsers: number;
    maxWorkspaces: number;
    maxResourcesPerWorkspace: number;
    userCount: number;
    workspaceCount: number;
  };
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-black">Plan limits</p>
        <p className="text-sm font-medium text-zinc-600">
          Contact us to raise these.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LimitTile label="Users" current={org.userCount} cap={org.maxUsers} />
        <LimitTile
          label="Workspaces"
          current={org.workspaceCount}
          cap={org.maxWorkspaces}
        />
        <LimitTile
          label="Files per workspace"
          current={null}
          cap={org.maxResourcesPerWorkspace}
        />
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
