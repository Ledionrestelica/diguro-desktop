import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Slider } from 'radix-ui';
import { Modal } from '@/components/ui/modal';
import { DsButton } from '@/components/ui/ds-button';

/** Crop frame in the 272px-tall crop area, and the exported logo size. */
const FRAME = 200;
const OUTPUT = 512;
const MAX_ZOOM = 3;

type Offset = { x: number; y: number };

type LogoCropDialogProps = {
  file: File | null;
  onCancel: () => void;
  onSave: (logo: Blob) => void;
};

/** "Position your logo": drag to move, slider to zoom, square PNG out. */
export function LogoCropDialog({ file, onCancel, onSave }: LogoCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ start: Offset; origin: Offset } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scale = natural ? (FRAME / Math.min(natural.w, natural.h)) * zoom : 1;
  const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: FRAME, h: FRAME };

  function clamp(next: Offset, size = shown): Offset {
    const maxX = Math.max(0, (size.w - FRAME) / 2);
    const maxY = Math.max(0, (size.h - FRAME) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: { x: e.clientX, y: e.clientY }, origin: offset };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const { start, origin } = drag.current;
    setOffset(clamp({ x: origin.x + e.clientX - start.x, y: origin.y + e.clientY - start.y }));
  }

  function changeZoom(next: number) {
    setZoom(next);
    if (!natural) return;
    const s = (FRAME / Math.min(natural.w, natural.h)) * next;
    setOffset((o) => clamp(o, { w: natural.w * s, h: natural.h * s }));
  }

  function save() {
    const img = imgRef.current;
    if (!img || !natural) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const left = shown.w / 2 - offset.x - FRAME / 2;
    const top = shown.h / 2 - offset.y - FRAME / 2;
    ctx.drawImage(
      img,
      left / scale,
      top / scale,
      FRAME / scale,
      FRAME / scale,
      0,
      0,
      OUTPUT,
      OUTPUT,
    );
    canvas.toBlob((blob) => blob && onSave(blob), 'image/png');
  }

  const imageStyle = (box: number) => {
    const k = box / FRAME;
    return {
      width: shown.w * k,
      height: shown.h * k,
      left: box / 2 - (shown.w / 2) * k + offset.x * k,
      top: box / 2 - (shown.h / 2) * k + offset.y * k,
    };
  };

  return (
    <Modal
      open={file !== null}
      onOpenChange={(open) => !open && onCancel()}
      title="Position your logo"
      description="Drag to move, use the slider to zoom."
      footer={
        <>
          <DsButton size="md" onClick={onCancel}>
            Cancel
          </DsButton>
          <DsButton variant="primary" size="md" onClick={save} disabled={!natural}>
            Save logo
          </DsButton>
        </>
      }
    >
      <div
        className="relative h-[272px] w-full cursor-grab touch-none overflow-hidden rounded-[12px] bg-bg-subtle select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
            style={{
              width: shown.w,
              height: shown.h,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 size-[200px] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border-2 border-text-on-solid shadow-[0_0_0_9999px_color-mix(in_srgb,var(--color-gray-12)_35%,transparent)]"
        />
      </div>

      <div className="flex items-center gap-3 text-label-16 font-medium text-text-secondary">
        <span aria-hidden="true">−</span>
        <Slider.Root
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={[zoom]}
          onValueChange={([v]) => v !== undefined && changeZoom(v)}
          aria-label="Zoom"
          className="relative flex h-4 flex-1 touch-none items-center select-none"
        >
          <Slider.Track className="relative h-1 grow rounded-full bg-selected">
            <Slider.Range className="absolute h-full rounded-full bg-primary" />
          </Slider.Track>
          <Slider.Thumb className="block size-4 rounded-full border border-border bg-white shadow-[0_2px_4px_var(--color-gray-a5)] outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]" />
        </Slider.Root>
        <span aria-hidden="true">+</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex-1 text-label-13 font-medium text-text-secondary">Preview</span>
        {[
          { box: 40, radius: 'rounded-[10px]' },
          { box: 24, radius: 'rounded-[6px]' },
          { box: 16, radius: 'rounded-[4px]' },
        ].map(({ box, radius }) => (
          <div
            key={box}
            className={`relative shrink-0 overflow-hidden bg-bg-subtle ${radius}`}
            style={{ width: box, height: box }}
          >
            {src && natural && (
              <img src={src} alt="" className="absolute max-w-none" style={imageStyle(box)} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
