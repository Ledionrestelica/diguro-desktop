import type { ComponentType } from 'react';
import { PiFilePdfFormatStroke } from '@/components/icons/pika/PiFilePdfFormatStroke';
import { PiFileTextStroke } from '@/components/icons/pika/PiFileTextStroke';
import { PiFileBarGraphStroke } from '@/components/icons/pika/PiFileBarGraphStroke';
import { PiFileDefaultStroke } from '@/components/icons/pika/PiFileDefaultStroke';

type IconSpec = { Icon: ComponentType<{ size?: number; className?: string }>; color: string };

const BY_EXTENSION: Record<string, IconSpec> = {
  pdf: { Icon: PiFilePdfFormatStroke, color: 'text-tomato-9' },
  doc: { Icon: PiFileTextStroke, color: 'text-blue-9' },
  docx: { Icon: PiFileTextStroke, color: 'text-blue-9' },
  md: { Icon: PiFileTextStroke, color: 'text-text-secondary' },
  txt: { Icon: PiFileTextStroke, color: 'text-text-secondary' },
  xls: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
  xlsx: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
  csv: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
};

/** File-type icon for a source document, in the 24px bubble the trace uses. */
export function SourceIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const { Icon, color } = BY_EXTENSION[ext] ?? {
    Icon: PiFileDefaultStroke,
    color: 'text-text-secondary',
  };
  return (
    <span className="flex shrink-0 items-center rounded-full p-[5px]">
      <Icon size={14} className={color} />
    </span>
  );
}
