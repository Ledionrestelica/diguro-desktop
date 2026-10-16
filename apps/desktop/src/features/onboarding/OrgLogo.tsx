import { cn } from '@/lib/utils';

/** Organization logo tile: the uploaded image, or the warm gradient with the
 *  organization's initial (the placeholder used throughout the Figma file). */
export function OrgLogo({
  src,
  name,
  className,
  letterClassName,
}: {
  src: string | null;
  name: string;
  className?: string;
  letterClassName?: string;
}) {
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 object-cover', className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#fff7c2_0%,#fdee9d_50%,#fbe577_100%)] font-semibold text-text',
        className,
      )}
    >
      <span className={letterClassName}>{name.trim().charAt(0).toUpperCase() || 'A'}</span>
    </span>
  );
}
