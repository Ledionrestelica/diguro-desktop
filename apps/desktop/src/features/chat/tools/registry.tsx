import type { ComponentType } from 'react';
import type { UIMessagePart } from 'ai';
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

/**
 * Render a tool part if its tool name is in the registry. Provider-native
 * tools (e.g. OpenAI `web_search`) return null here — they're rendered by
 * the inline SearchIndicator + SourceList in Message.tsx instead.
 */
export function ToolPart({ part }: { part: UIMessagePart<unknown, Record<string, never>> }) {
  if (!isToolPart(part)) return null;
  const name = part.type.slice('tool-'.length);
  const Component = TOOL_COMPONENTS[name];
  if (!Component) return null;
  return <Component input={part.input} state={part.state} />;
}

type ToolPartShape = {
  type: `tool-${string}`;
  state: ToolState;
  input: unknown;
};

function isToolPart(
  part: UIMessagePart<unknown, Record<string, never>>,
): part is ToolPartShape {
  const t = (part as { type?: unknown }).type;
  return typeof t === 'string' && t.startsWith('tool-') && t.length > 5;
}
