import type { ToolSet } from 'ai';
import { renderChartTool } from './render-chart.ts';
import { renderComparisonTool } from './render-comparison.ts';
import { renderDocumentCardTool } from './render-document-card.ts';
import { renderExtractionFormTool } from './render-extraction-form.ts';
import { renderTableTool } from './render-table.ts';

/**
 * Generative UI tools — pass-through `execute` (rendering is client-side).
 * The tool name is what the client registry keys off; changing a name here
 * means updating `apps/desktop/src/features/chat/tools/registry.tsx` too.
 */
export function createUITools(): ToolSet {
  return {
    render_chart: renderChartTool,
    render_table: renderTableTool,
    render_document_card: renderDocumentCardTool,
    render_comparison: renderComparisonTool,
    render_extraction_form: renderExtractionFormTool,
  };
}

/**
 * Names of the UI tools — exported so logs / system prompt generation / the
 * client registry can stay in sync.
 */
export const UI_TOOL_NAMES = [
  'render_chart',
  'render_table',
  'render_document_card',
  'render_comparison',
  'render_extraction_form',
] as const;
export type UIToolName = (typeof UI_TOOL_NAMES)[number];
