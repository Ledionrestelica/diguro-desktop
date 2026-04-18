import { Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { OrganizationMark } from '@/features/organization/OrganizationMark';

/**
 * Top-of-sidebar organization card. Shows the active organization's name +
 * logo. The settings button is visible to org admins (superadmin /
 * organization_admin) and routes into the organization admin surface.
 */
export function OrgSwitcher() {
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery();

  const org = me.data?.organization;
  const orgName = org?.name ?? '—';
  const canAdminOrg =
    me.data?.role === 'superadmin' || me.data?.role === 'organization_admin';

  return (
    <div
      className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-xl border border-zinc-200 bg-white px-[7px]"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 280% 820% at 50% -8%, rgba(246, 250, 254, 1) 12%, rgba(217, 233, 249, 1) 77%)',
      }}
    >
      <div className="flex size-8 items-center justify-center rounded-[4.8px] bg-white">
        <OrganizationMark
          logoUrl={org?.logoUrl}
          seed={org?.id}
          primaryColor={org?.primaryColor}
          size={20}
          alt={orgName}
        />
      </div>
      <span className="flex-1 truncate text-sm font-medium text-black" title={orgName}>
        {orgName}
      </span>
      {canAdminOrg && (
        <button
          type="button"
          aria-label="Organization settings"
          onClick={() => void navigate('/admin/organization/general')}
          className="grid size-8 place-items-center rounded-md text-zinc-600 hover:bg-black/5"
        >
          <Settings2 className="size-4" />
        </button>
      )}
    </div>
  );
}
