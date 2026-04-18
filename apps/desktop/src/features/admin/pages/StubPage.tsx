import { Construction } from 'lucide-react';
import { AdminPageBody } from '../AdminLayout';

/**
 * Lightweight placeholder for admin tabs that aren't implemented yet. Keeps
 * the sidebar navigable without crashing, signals clearly that the page
 * isn't done. Delete when the real page lands.
 */
export function StubPage({
  title,
  description,
  eta,
}: {
  title: string;
  description: string;
  eta?: string;
}) {
  return (
    <AdminPageBody>
      <div className="flex max-w-xl flex-col items-start gap-4 rounded-[12px] border border-dashed border-zinc-300 bg-white/60 p-8">
        <div className="grid size-10 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
          <Construction className="size-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-zinc-900">{title}</p>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
        {eta && (
          <p className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {eta}
          </p>
        )}
      </div>
    </AdminPageBody>
  );
}
