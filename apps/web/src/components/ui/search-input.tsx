import { cn } from 'cn';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Input } from './input';

type SearchInputProps = ComponentProps<typeof Input> & {
  wrapperClassName?: string;
};

function SearchInput({
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className={cn(
          'h-11 rounded-full border-border pl-11 pr-4 dark:bg-secondary',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export { SearchInput };
