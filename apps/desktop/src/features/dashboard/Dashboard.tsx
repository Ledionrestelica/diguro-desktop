import { LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Props {
  onSignOut: () => void;
}

export function Dashboard({ onSignOut }: Props) {
  const me = trpc.health.me.useQuery();
  const ping = trpc.health.ping.useQuery();

  async function signOut() {
    await apiAuth.signOut();
    onSignOut();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Diguro</h1>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>health.ping</CardTitle>
            <CardDescription>Public unauthed probe.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">
              {ping.isLoading ? 'loading…' : JSON.stringify(ping.data, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>health.me</CardTitle>
            <CardDescription>Authed — uses your bearer token.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">
              {me.isLoading
                ? 'loading…'
                : me.error
                  ? `error: ${me.error.message}`
                  : JSON.stringify(me.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
