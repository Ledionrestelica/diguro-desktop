#!/usr/bin/env node
/**
 * Copies Pika Icons (paid, licensed — keep this repo private) from the local
 * Pika download into apps/desktop/src/components/icons/pika, one component
 * per file, adapted to repo conventions:
 *   - named export instead of default
 *   - `import type { SVGProps }`, no `JSX.Element` return type
 *   - decorative by default: aria-hidden unless `ariaLabel` is passed
 *
 * Usage:
 *   pnpm icons:pika EnvelopeDefault ArrowLeft      # specific icons
 *   pnpm icons:pika --all                          # every icon in the style
 *   pnpm icons:pika --all --style=solid            # another style
 *
 * Names are the Pika component name without the `Pi` prefix and style
 * suffix (PiEnvelopeDefaultStroke → EnvelopeDefault). The Figma name
 * "envelope/envelope-default" maps to the same icon.
 *
 * Source folder: $PIKA_ICONS_DIR, or the default Downloads location below.
 * It must contain the `react-tsx` package from the Pika download.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STYLES = { stroke: 'Stroke', solid: 'Solid', 'duo-stroke': 'DuoStroke', 'duo-solid': 'DuoSolid', contrast: 'Contrast' };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'apps/desktop/src/components/icons/pika');
const sourceRoot =
  process.env.PIKA_ICONS_DIR ??
  join(homedir(), 'Downloads/Pikaicons-v2.2-solo/svg and js pakages/react-tsx');

const args = process.argv.slice(2);
const all = args.includes('--all');
const style = (args.find((a) => a.startsWith('--style='))?.split('=')[1] ?? 'stroke').toLowerCase();
const names = args.filter((a) => !a.startsWith('--'));

if (!STYLES[style]) fail(`Unknown style "${style}". Use one of: ${Object.keys(STYLES).join(', ')}.`);
if (!all && names.length === 0) fail('Pass icon names (e.g. EnvelopeDefault) or --all.');
const styleDir = join(sourceRoot, style);
if (!existsSync(styleDir)) {
  fail(`Pika source not found at ${styleDir}.\nSet PIKA_ICONS_DIR to the folder containing the Pika "react-tsx" package.`);
}

const suffix = STYLES[style];
const available = new Map(walk(styleDir).map((f) => [basename(f, '.tsx'), f]));
const wanted = all
  ? [...available.keys()]
  : names.map((n) => `Pi${n.replace(/^Pi/, '').replace(new RegExp(`${suffix}$`), '')}${suffix}`);

const missing = wanted.filter((n) => !available.has(n));
if (missing.length) fail(`Not found in ${style}: ${missing.join(', ')}`);

mkdirSync(outDir, { recursive: true });
const written = wanted.map((name) => {
  const src = available.get(name);
  const target = join(outDir, `${name}.tsx`);
  writeFileSync(target, adapt(readFileSync(src, 'utf8'), relative(styleDir, src)));
  return target;
});

execFileSync('pnpm', ['exec', 'prettier', '--log-level', 'warn', '--write', ...written], {
  cwd: repoRoot,
  stdio: 'inherit',
});
console.log(`Added ${written.length} ${style} icon${written.length === 1 ? '' : 's'} to ${relative(repoRoot, outDir)}`);

function adapt(code, from) {
  const out = code
    .replace(/^import React from 'react';/m, "import type { SVGProps } from 'react';")
    .replace(/React\.SVGProps/g, 'SVGProps')
    .replace(/^export default function /m, 'export function ')
    .replace(/\): JSX\.Element \{/, ') {')
    .replace(/ariaLabel = '[^']*',/, 'ariaLabel,')
    .replace(/role="img"/, "role={ariaLabel ? 'img' : undefined}")
    .replace(/aria-label=\{ariaLabel\}/, 'aria-label={ariaLabel}\n      aria-hidden={ariaLabel ? undefined : true}');
  if (out === code || !out.includes('export function ')) fail(`Unexpected Pika file format: ${from}`);
  return out;
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
