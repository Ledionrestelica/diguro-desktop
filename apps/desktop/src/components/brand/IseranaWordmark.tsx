import wordmark from '@/assets/brand/iserana-wordmark.svg';

export function IseranaWordmark({ className }: { className?: string }) {
  return <img src={wordmark} alt="Iserana" width={107} height={18} className={className} />;
}
