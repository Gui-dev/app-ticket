import { describe, expect, it } from 'vitest';
import type { CategoryEntity } from '../domain/category-entity';
import { InMemoryCategoriesRepository } from '../infra/in-memory-categories-repository';
import { ListCategoriesUseCase } from './list-categories.use-case';

const stubCategories: CategoryEntity[] = [
  { slug: 'teatro', name: 'Teatro' },
  { slug: 'comedy', name: 'Comédia' },
  { slug: 'shows', name: 'Shows' },
];

describe('ListCategoriesUseCase', () => {
  it('returns categories ordered by name', async () => {
    const useCase = new ListCategoriesUseCase(
      new InMemoryCategoriesRepository(stubCategories),
    );

    const result = await useCase.execute();

    expect(result.map((category) => category.slug)).toEqual([
      'comedy',
      'shows',
      'teatro',
    ]);
  });
});
