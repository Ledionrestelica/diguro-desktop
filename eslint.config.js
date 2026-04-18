// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/**
 * Flat-config ESLint. One config for the whole monorepo — package-specific
 * tweaks are scoped with `files: [...]` rules instead of per-package configs.
 *
 * Rationale:
 *  - typescript-eslint recommendedTypeChecked gives us loose-types detection
 *    (no-explicit-any, no-unsafe-*, no-floating-promises) — matches
 *    CLAUDE.md's "no loose types" directive.
 *  - React hooks rules only apply to .tsx in apps/desktop.
 *  - We disable a couple of rules that are pedantic in this codebase:
 *      - `no-misused-promises { checksVoidReturn }`: too noisy for event
 *        handlers that legitimately call async functions.
 *      - `no-unused-vars` via TS rule instead of base rule to pick up types.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/drizzle/**',
      '**/*.config.js',
      '**/*.config.ts',
      'eslint.config.js',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript — type-aware rules for the whole repo
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Explicit project list — projectService fails to walk cross-workspace
        // tRPC type chains (RouterOutputs<AppRouter> → api src → drizzle types),
        // producing spurious no-unsafe-* errors. Listing each tsconfig forces
        // the parser to load the full graph upfront.
        project: [
          './packages/shared/tsconfig.json',
          './packages/db/tsconfig.json',
          './packages/trpc/tsconfig.json',
          './apps/api/tsconfig.json',
          './apps/desktop/tsconfig.app.json',
          './apps/desktop/tsconfig.electron.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Unused vars — allow _-prefixed destructuring ignores
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // Pedantic for this codebase — event handlers pass async callbacks legitimately
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false },
      ],
      // Allow `{}` and other looser object types where it genuinely is intentional
      '@typescript-eslint/no-empty-object-type': 'off',
      // Permit intentional `void someAsync()` fire-and-forget
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: true },
      ],
    },
  },

  // React — hooks + fast-refresh, desktop renderer only
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // shadcn/ui primitives are vendor-owned — they mix component + variant
  // exports (buttonVariants, badgeVariants, SidebarContext) which trips
  // react-refresh. Linting their internals is the upstream project's job.
  {
    files: ['apps/desktop/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Config files, migrations, scripts — relax type-aware rules
  {
    files: [
      '**/drizzle.config.ts',
      '**/vite.config.ts',
      '**/electron.vite.config.ts',
      'packages/db/migrate.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
