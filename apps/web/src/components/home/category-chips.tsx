'use client';

import type { CategoryDto, SearchFilters } from '@ticketvibe/shared';
import { useRouter } from 'next/navigation';

import { Chip } from '@/components/ui/chip';
import { categoryIcon } from '@/lib/category-icons';
import { buildSearchPath } from '@/lib/search-params';

type CategoryChipsProps = {
  categories: CategoryDto[];
  filters: SearchFilters;
};

export function CategoryChips({ categories, filters }: CategoryChipsProps) {
  const router = useRouter();

  if (categories.length === 0) return null;

  function toggle(slug: string) {
    const category = filters.category === slug ? undefined : slug;
    router.replace(buildSearchPath({ ...filters, category }));
  }

  return (
    <fieldset
      aria-label="Filtrar por categoria"
      className="flex min-w-0 gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"
    >
      {categories.map((category) => (
        <Chip
          key={category.slug}
          icon={categoryIcon(category.slug)}
          label={category.name}
          selected={filters.category === category.slug}
          onClick={() => toggle(category.slug)}
        />
      ))}
    </fieldset>
  );
}
