import type { ComponentType } from 'react';
import { PiPeopleFemaleFemaleStroke } from '@/components/icons/pika/PiPeopleFemaleFemaleStroke';
import { PiBankStroke } from '@/components/icons/pika/PiBankStroke';
import { PiTagStroke } from '@/components/icons/pika/PiTagStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { Spinner } from './Spinner';
import { SidebarItem, SidebarSectionHeader } from './SidebarItem';
import { useWorkspaceSwitch } from './useWorkspaceSwitch';

/** Workspaces without a logo get a stable icon + colour from this set, so
 *  the list reads like the Figma (HR green, Finance blue, Sales amber). */
const GLYPHS: Array<{ Icon: ComponentType<{ size?: number; className?: string }>; color: string }> =
  [
    { Icon: PiPeopleFemaleFemaleStroke, color: 'text-green-9' },
    { Icon: PiBankStroke, color: 'text-blue-9' },
    { Icon: PiTagStroke, color: 'text-amber-8' },
    { Icon: PiFolderDefaultStroke, color: 'text-iris-9' },
  ];

function glyphFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return GLYPHS[Math.abs(hash) % GLYPHS.length] ?? GLYPHS[0]!;
}

export function WorkspaceGlyphIcon({ id, logoUrl }: { id: string; logoUrl: string | null }) {
  if (logoUrl) return <img src={logoUrl} alt="" className="size-4 rounded-[4px] object-cover" />;
  const { Icon, color } = glyphFor(id);
  return <Icon size={16} className={color} />;
}

/** The current workspace gets the selected fill only when no chat or page
 *  is selected; otherwise it keeps dark text so you still see where you are. */
export function WorkspaceList({ selectedElsewhere }: { selectedElsewhere: boolean }) {
  const { workspaces, activeId, pendingId, switching, pick } = useWorkspaceSwitch();
  if (workspaces.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <SidebarSectionHeader label="Workspaces" />
      {workspaces.map((ws) => {
        const active = ws.id === activeId;
        return (
          <SidebarItem
            key={ws.id}
            fluidKey={`ws-${ws.id}`}
            icon={<WorkspaceGlyphIcon id={ws.id} logoUrl={ws.logoUrl ?? null} />}
            label={ws.name}
            tone={active ? (selectedElsewhere ? 'current' : 'active') : 'muted'}
            aria-current={active ? 'true' : undefined}
            disabled={switching}
            onClick={() => void pick(ws.id)}
            {...(pendingId === ws.id ? { trailing: <Spinner /> } : {})}
          />
        );
      })}
    </section>
  );
}
