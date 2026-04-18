/**
 * Names of generative-UI tools. Must stay in sync with the server registry at
 * `apps/api/src/ai/ui-tools/index.ts`. Exported from a dedicated file so that
 * `Message.tsx`'s block walker can reach the set without importing the React
 * components in `registry.tsx` (which would trip Vite's fast-refresh rules).
 */
export const GENERATIVE_UI_TOOL_NAMES = new Set<string>([
  'render_chart',
  'render_table',
  'render_document_card',
  'render_comparison',
  'render_extraction_form',
]);

export function isGenerativeUIToolName(name: string): boolean {
  return GENERATIVE_UI_TOOL_NAMES.has(name);
}
