import { OrganizationMark } from '@/features/organization/OrganizationMark';

/** The organization's 24px round mark (logo, or its initial on primary). */
export function OrgAvatar({
  org,
}: {
  org: { id: string; name: string; logoUrl: string | null } | null | undefined;
}) {
  if (org?.logoUrl) {
    return (
      <OrganizationMark
        logoUrl={org.logoUrl}
        seed={org.id}
        size={24}
        alt=""
        className="rounded-full"
      />
    );
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-label-12 font-semibold text-text-on-solid">
      {(org?.name ?? 'I').charAt(0).toUpperCase()}
    </span>
  );
}
