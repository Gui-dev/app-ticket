import type { CategoriesRepository } from '../domain/categories-repository';
import type { CategoryEntity } from '../domain/category-entity';

export class InMemoryCategoriesRepository implements CategoriesRepository {
  constructor(private readonly items: CategoryEntity[]) {}

  findAll(): Promise<CategoryEntity[]> {
    const sorted = [...this.items].sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(sorted);
  }
}
