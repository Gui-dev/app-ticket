import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';

type ChipProps = {
  icon?: LucideIcon;
  label: string;
  selected?: boolean;
  className?: string;
};

function Chip({ icon: Icon, label, selected = false, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected
          ? 'border-transparent bg-primary font-semibold text-primary-foreground hover:bg-primary-hover'
          : 'border-border bg-secondary text-foreground hover:bg-accent',
        className,
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

export { Chip };
