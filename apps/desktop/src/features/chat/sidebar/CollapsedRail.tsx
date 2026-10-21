import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PiPlusDefaultStroke } from '@/components/icons/pika/PiPlusDefaultStroke';
import { PiSearchDefaultStroke } from '@/components/icons/pika/PiSearchDefaultStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiSparkleAI02Stroke } from '@/components/icons/pika/PiSparkleAI02Stroke';
import { PiSidebarLeftOpenStroke } from '@/components/icons/pika/PiSidebarLeftOpenStroke';
import { CustomInstructionsButton } from '../CustomInstructionsButton';
import { WorkspaceGlyphIcon } from './WorkspaceList';
import { useWorkspaceSwitch } from './useWorkspaceSwitch';
import { OrgAvatar } from './OrgAvatar';
import { UserFooter } from './UserFooter';

/**
 * The collapsed sidebar (Figma "Chat - Final · New Sidebar - Collapsed"):
 * a 64px rail of 36px icon buttons with tooltips for their labels. Chats
 * have no icon form, so folders and search open the full sidebar.
 */
export function CollapsedRail({ onExpand }: { onExpand: (opts?: { search?: boolean }) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = trpc.health.me.useQuery();
  const folders = trpc.conversations.foldersList.useQuery();
  const { workspaces, activeId, switching, pick } = useWorkspaceSwitch();
  const org = me.data?.organization;

  return (
    <aside className="flex h-full w-16 shrink-0 flex-col items-center justify-between px-3.5 py-4 font-inter text-text antialiased">
      <div className="flex flex-col items-center gap-3">
        <RailTooltip label={org?.name ?? 'Switch workspace'}>
          <button
            type="button"
            onClick={() => void navigate('/workspaces')}
            aria-label="Switch workspace"
            className="grid size-9 cursor-pointer place-items-center rounded-full border border-gray-4 bg-bg-panel shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none hover:bg-gray-2 focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
          >
            <OrgAvatar org={org} />
          </button>
        </RailTooltip>

        <nav className="flex flex-col items-center gap-1">
          <RailButton label="New chat" onClick={() => void navigate('/chat')}>
            <PiPlusDefaultStroke size={16} className="text-text" />
          </RailButton>
          <RailButton label="Search" hint="⌘K" onClick={() => onExpand({ search: true })}>
            <PiSearchDefaultStroke size={16} />
          </RailButton>
          <RailButton
            label="Files"
            active={location.pathname.startsWith('/my-files')}
            onClick={() => void navigate('/my-files')}
          >
            <PiFolderDefaultStroke size={16} />
          </RailButton>
          <CustomInstructionsButton
            align="start"
            trigger={
              <div>
                <RailButton label="Custom instructions">
                  <PiSparkleAI02Stroke size={16} />
                </RailButton>
              </div>
            }
          />
        </nav>

        {workspaces.length > 0 && (
          <>
            <RailDivider />
            <div className="flex flex-col items-center gap-1">
              {workspaces.map((ws) => (
                <RailButton
                  key={ws.id}
                  label={ws.name}
                  active={ws.id === activeId}
                  disabled={switching}
                  onClick={() => void pick(ws.id)}
                >
                  <WorkspaceGlyphIcon id={ws.id} logoUrl={ws.logoUrl ?? null} />
                </RailButton>
              ))}
            </div>
          </>
        )}

        {(folders.data?.length ?? 0) > 0 && (
          <>
            <RailDivider />
            <div className="flex flex-col items-center gap-1">
              {folders.data?.map((folder) => (
                <RailButton key={folder.id} label={folder.name} onClick={() => onExpand()}>
                  <PiFolderDefaultStroke
                    size={16}
                    {...(folder.color ? { style: { color: folder.color } } : {})}
                  />
                </RailButton>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <RailButton label="Expand sidebar" onClick={() => onExpand()}>
          <PiSidebarLeftOpenStroke size={16} />
        </RailButton>
        <UserFooter compact />
      </div>
    </aside>
  );
}

function RailButton({
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <RailTooltip label={label} {...(hint ? { hint } : {})}>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? 'true' : undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'grid size-9 cursor-pointer place-items-center rounded-[10px] text-text-secondary outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-default',
          active ? 'bg-gray-3 text-text' : 'hover:bg-hover hover:text-text',
        )}
      >
        {children}
      </button>
    </RailTooltip>
  );
}

function RailTooltip({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="font-inter text-label-12 font-medium">
        {label}
        {hint && <span className="ml-1.5 text-gray-8">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function RailDivider() {
  return <span aria-hidden className="my-1 h-px w-5 bg-gray-4" />;
}
