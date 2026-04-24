import type { ComponentType } from 'react';
import { ChartTool } from './ChartTool';
import { ComparisonTool } from './ComparisonTool';
import { DocumentCardTool } from './DocumentCardTool';
import { ExtractionFormTool } from './ExtractionFormTool';
import { TableTool } from './TableTool';
import type { ToolState } from './shared';

export interface ToolComponentProps {
  input: unknown;
  state: ToolState;
}

/**
 * Registry mapping generative-UI tool names to their React renderers.
 * Names here MUST match the keys in apps/api/src/ai/ui-tools/index.ts —
 * those are what AI-SDK emits as `tool-<name>` part types. The string set
 * in `./names.ts` is the source of truth for "is this one of our UI tools";
 * callers that only need to gate on the name import from there.
 */
const TOOL_COMPONENTS: Record<string, ComponentType<ToolComponentProps>> = {
  render_chart: ChartTool,
  render_table: TableTool,
  render_document_card: DocumentCardTool,
  render_comparison: ComparisonTool,
  render_extraction_form: ExtractionFormTool,
};

type ToolPartShape = {
  type: `tool-${string}`;
  state: ToolState;
  input: unknown;
};

/**
 * Render a tool part if its tool name is in the registry. Provider-native
 * tools (e.g. OpenAI `web_search`) return null here — they're rendered by
 * the inline SearchIndicator + SourceList in Message.tsx instead.
 *
 * We accept `unknown` for `part` and narrow via `isToolPart` because the
 * AI-SDK `UIMessagePart` generic requires a `UIDataTypes` map we don't
 * thread through the tree; our runtime predicate checks what we actually
 * need.
 */
export function ToolPart({ part }: { part: unknown }) {
  if (!isToolPart(part)) return null;
  const name = part.type.slice('tool-'.length);
  const Component = TOOL_COMPONENTS[name];
  if (!Component) return null;
  return <Component input={part.input} state={part.state} />;
}

function isToolPart(part: unknown): part is ToolPartShape {
  if (!part || typeof part !== 'object') return false;
  const t = (part as { type?: unknown }).type;
  if (typeof t !== 'string' || !t.startsWith('tool-') || t.length <= 5) {
    return false;
  }
  const state = (part as { state?: unknown }).state;
  return (
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'output-available' ||
    state === 'output-error'
  );
}
