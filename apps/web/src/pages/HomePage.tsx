import { useNavigate } from 'react-router-dom';
import { Download, LogOut, Monitor } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { AuthCard } from '../components/AuthCard';

/**
 * Placeholder home page. For v1 the web companion is just the entry
 * point — sign up / accept invite / direct people to the desktop app.
 * Full feature parity (chat, files, admin) in the browser lands later.
 */
export function HomePage() {
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  if (me.isLoading) return null;

  if (!me.data) {
    return (
      <AuthCard
        title="Welcome to Diguro"
        subtitle="Sign in or create an account to get started."
      >
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void navigate('/sign-in')}
            className="flex-1 rounded-[10px] border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => void navigate('/sign-up')}
            className="flex-1 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign up
          </button>
        </div>
      </AuthCard>
    );
  }

  async function handleSignOut() {
    await apiAuth.signOut();
    await utils.health.me.invalidate();
    void navigate('/sign-in');
  }

  return (
    <AuthCard
      title={`Hi, ${me.data.email}`}
      subtitle={
        me.data.organization
          ? `You're part of ${me.data.organization.name}. Open the desktop app to start chatting.`
          : "You don't belong to an organization yet. Ask your admin for an invite."
      }
      footer={
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      }
    >
      <div className="flex flex-col gap-3 rounded-[12px] border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-white text-zinc-700">
            <Monitor className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Diguro works best in the desktop app
            </p>
            <p className="text-xs text-zinc-500">
              Full chat, file library, and admin tools live there.
            </p>
          </div>
        </div>
        <a
          href="https://diguro.se/download"
          className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Download className="size-4" />
          Download for macOS / Windows
        </a>
      </div>
    </AuthCard>
  );
}
