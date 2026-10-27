import { WorkspaceGlyph } from '@/features/workspaces/WorkspaceGlyph';
import { PiPlusDefaultStroke } from '@/components/icons/pika/PiPlusDefaultStroke';
import { PiSearchDefaultStroke } from '@/components/icons/pika/PiSearchDefaultStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiArrowUpStroke } from '@/components/icons/pika/PiArrowUpStroke';
import { cn } from '@/lib/utils';

/**
 * A miniature of the app as the organization's members see it (Figma
 * "Settings · Organization · General · v2" → Preview): the logo and name in
 * the sidebar, a couple of workspaces and a short chat. Decorative only.
 */
export function BrandPreview({
  name,
  logoUrl,
  glyphSeed,
  workspaceNames,
}: {
  name: string;
  logoUrl: string | null;
  glyphSeed: string;
  workspaceNames: string[];
}) {
  const workspaces = workspaceNames.length > 0 ? workspaceNames.slice(0, 2) : ['General'];
  return (
    <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
      <div className="flex items-center justify-between">
        <p className="text-label-14 font-medium">Preview</p>
        <p className="text-label-12 text-text-placeholder">How your team sees {name}</p>
      </div>
      <div
        aria-hidden
        className="flex h-[196px] gap-3 overflow-hidden rounded-[14px] border border-border-default bg-bg-app pt-4 pl-4"
      >
        <div className="flex w-[150px] shrink-0 flex-col gap-1">
          <div className="flex items-center gap-2 pb-2.5">
            <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <WorkspaceGlyph seed={glyphSeed} size={20} />
              )}
            </span>
            <span className="truncate text-label-12 font-semibold">{name}</span>
          </div>
          <MiniNav icon={<PiPlusDefaultStroke size={12} />} label="New chat" />
          <MiniNav icon={<PiSearchDefaultStroke size={12} />} label="Search" />
          {workspaces.map((ws, i) => (
            <MiniNav
              key={ws}
              icon={<PiFolderDefaultStroke size={12} />}
              label={ws}
              selected={i === 0}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-tl-[12px] bg-bg-panel px-4 pt-3.5">
          <div className="flex justify-end">
            <span className="rounded-[8px] bg-bg-app px-2.5 py-1.5 text-[11px] leading-4">
              When does our lease renew?
            </span>
          </div>
          <p className="flex items-center gap-1 text-[11px] leading-4">
            The lease renews on March 1, 2027
            <span className="grid size-3.5 place-items-center rounded-full bg-blue-9 text-[8px] font-semibold text-white">
              1
            </span>
          </p>
          <span className="h-1.5 w-3/4 rounded-full bg-gray-3" />
          <span className="h-1.5 w-1/2 rounded-full bg-gray-3" />
          <div className="mt-auto mb-3 flex items-center justify-between rounded-[10px] border border-border-default py-1.5 pr-1.5 pl-2.5">
            <span className="text-[11px] leading-4 text-text-placeholder">Ask anything</span>
            <span className="grid size-5 place-items-center rounded-full bg-blue-9 text-white">
              <PiArrowUpStroke size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniNav({
  icon,
  label,
  selected = false,
}: {
  icon: React.ReactNode;
  label: string;
  selected?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-[8px] px-2 py-[5px] text-[11px] leading-4 font-medium',
        selected ? 'bg-blue-3 text-blue-11' : 'text-text-secondary',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}
