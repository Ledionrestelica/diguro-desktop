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

## Git workflow

- Don't create branches or pull requests. Work directly on `master`.
- When Bleart asks to commit or push, commit on `master` and push straight to `origin master`.
- Run `git pull --rebase origin master` before pushing. If it hits conflicts in files Bleart didn't touch, stop and write a question for Ledion instead of resolving them.
- Never force-push.

## How to talk to Bleart

- Use plain language. Explain what a change does to the product, not how the code works internally.
- Keep the design-quality bar high, and follow the code-quality rules in CLAUDE.md for anything you write.
- Before committing or pushing, check that the change stays within "What Bleart can go ahead with" above.
