import { Building2 } from 'lucide-react';
import { WorkspaceGlyph } from '../WorkspaceGlyph';

/**
 * Live preview of the workspace being created. Right-column card in the
 * wizard. Reflects the current wizard draft state — updates as the user types.
 */
export function WorkspacePreviewCard({
  name,
  memberCount = 0,
  logoDataUrl,
}: {
  name: string;
  memberCount?: number;
  logoDataUrl?: string;
}) {
  const displayName = name.trim() || 'Workspace Name';

  return (
    <div className="relative flex h-[227px] w-[560px] flex-col justify-end overflow-hidden rounded-[12px] border border-zinc-200 bg-zinc-100 p-8">
      <div className="absolute left-8 top-6 size-20 overflow-hidden rounded-[12px] bg-[#e5e7eb]">
        {logoDataUrl ? (
          <img src={logoDataUrl} alt="" className="size-full object-cover" />
        ) : (
          <WorkspacePreviewGlyph name={displayName} />
        )}
      </div>
      <div className="flex items-end justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium leading-7 text-black">
            {displayName}
          </p>
          <p className="mt-1 text-sm font-medium leading-5 text-zinc-500">
            {memberCount} Member{memberCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkspacePreviewGlyph({ name }: { name: string }) {
  if (!name.trim() || name === 'Workspace Name') {
    return (
      <div className="grid size-full place-items-center text-zinc-400">
        <Building2 className="size-8" />
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center">
      <WorkspaceGlyph seed={name} size={72} className="rounded-[12px]" />
    </div>
  );
}
