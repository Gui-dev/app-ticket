'use client';

import type { CategoryDto, SearchFilters } from '@ticketvibe/shared';

import { Chip } from '@/components/ui/chip';
import { categoryIcon } from '@/lib/category-icons';
import { useSearchFilters } from '@/lib/use-search-filters';

type CategoryChipsProps = {
  categories: CategoryDto[];
  filters: SearchFilters;
};

export function CategoryChips({ categories, filters }: CategoryChipsProps) {
  const { setFilters } = useSearchFilters();

  if (categories.length === 0) return null;

  function toggle(slug: string) {
    setFilters({ category: filters.category === slug ? null : slug });
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
