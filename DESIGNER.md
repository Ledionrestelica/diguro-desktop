# Working with Bleart (designer)

Instructions for Claude sessions run by Bleart, the designer on this team (Ledion's brother). Claude Code loads this file automatically through an import in [CLAUDE.md](CLAUDE.md).

## Who this applies to

These rules apply when the git user is Bleart, or anyone other than Ledion Restelica (check the git user from the session context, or `git config user.name`). If the git user is Ledion, ignore this file.

Bleart works mostly on frontend: UI, styling, layout, components and design tokens in `apps/desktop` and `apps/web`. He's not a backend engineer, so don't expect him to weigh technical trade-offs.

## What Bleart can go ahead with

Bleart can do these without asking:

- Visual changes: colors, spacing, typography, icons, animations, design tokens
- Layout and markup inside existing React components
- New presentational components inside an existing feature folder (`src/features/<feature>/`)
- Copy and wording changes
- Matching an implementation to a Figma or Paper design

## What counts as a technical decision

Stop and hand it to Ledion when the work would:

- Touch `apps/api`, `packages/db`, `packages/trpc` or `packages/shared` in any way
- Change the database schema, migrations, tRPC procedures or API contracts
- Add, remove or upgrade a dependency in any `package.json`
- Change how data is fetched, cached or stored (tRPC/React Query usage, Zustand stores, context providers)
- Change auth, permissions, roles, or anything about organizations, workspaces or scopes
- Change the Electron main process (`apps/desktop/electron/`), the preload script, IPC or auto-updates
- Change build, deploy or tooling config (Vite, TypeScript, ESLint, Turborepo, Docker, Caddy, CI)
- Restructure folders, move shared code, or create a new feature folder
- Choose between two or more approaches that have real trade-offs (performance, security, maintainability)
- Work around a type error with `any`, `as` casts, `@ts-ignore`, or by loosening types
- Delete or rewrite logic that Bleart didn't write in this session

If you're unsure whether something counts, treat it as a technical decision.

## What to do when a technical decision comes up

1. **Don't make the decision and don't implement it.** Don't pick an option silently either, even if the change looks small.
2. Tell Bleart plainly: **"This needs a technical decision, so I wrote this question for Ledion. Send it to him and he'll respond."**
3. Write the question as a self-contained message Ledion can answer without opening this session. Put it in a fenced code block so it's easy to copy:

   ```
   Question for Ledion

   What I'm working on: <one or two sentences on the design task>
   What came up: <the technical decision, in plain terms>
   Files involved: <paths>
   Options:
     A. <option> - <trade-off>
     B. <option> - <trade-off>
   Claude's recommendation: <option and why, one line>
   ```

4. Carry on with any parts of the task that don't depend on the answer, and say which part is waiting on Ledion.
5. When Bleart pastes Ledion's reply, follow it exactly.

## Start of every session

Before starting on Bleart's first request, get him up to date. Do this at the start of every session, not only the first one each day:

1. Run `git status`. If there are uncommitted changes, tell Bleart what they are and ask whether to commit them first or keep them as they are. Don't discard anything.
2. Make sure you're on `master` (`git switch master` if not).
3. Run `git pull --rebase origin master` to get everyone's latest changes.
4. If `pnpm-lock.yaml` or any `package.json` changed in the pull, run `pnpm install`. Always use `pnpm`, never `npm` or `yarn`: this is a pnpm workspace.
5. If the dev servers were already running, restart them so they pick up the new code.
6. Tell Bleart in one or two plain lines what came in, for example: "Pulled 3 new changes from Ledion: chat redesign fixes and a new password check."

## Running the app

- Start the API: `pnpm dev:api` (http://localhost:3000)
- Start the desktop app: `pnpm dev:desktop` (opens Electron, Vite on http://localhost:5173)
- Start the web app: `pnpm dev:web`
- In local dev, the email verification code is always `000000`.
- If the API fails to start because of missing environment variables or `.env.local`, don't make up values. Write a question for Ledion.

## Before every commit

Run these checks and fix anything they flag in Bleart's own changes:

1. `pnpm typecheck`: no TypeScript errors.
2. `pnpm lint`: no lint errors.
3. `pnpm exec prettier --write <changed files>`: format only the files Bleart changed. Don't run `pnpm format`: it reformats the whole repo and buries his change in unrelated diffs.
4. Open the changed screens in the running app and check that they look and work as intended.

If a check fails in code Bleart didn't touch, don't fix it. Mention it to him and include it in a question for Ledion.

Write commit messages as a short sentence in the imperative ("Make sidebar icons 16px", not "changes"). Keep each commit to one logical change.

## Git workflow

- Don't create branches or pull requests. Work directly on `master`.
- When Bleart asks to commit or push, commit on `master` and push straight to `origin master`.
- Run `git pull --rebase origin master` before pushing. If it hits conflicts in files Bleart didn't touch, stop and write a question for Ledion instead of resolving them.
- Never force-push.

## How to talk to Bleart

- Use plain language. Explain what a change does to the product, not how the code works internally.
- Keep the design-quality bar high, and follow the code-quality rules in CLAUDE.md for anything you write.
- Before committing or pushing, check that the change stays within "What Bleart can go ahead with" above.
