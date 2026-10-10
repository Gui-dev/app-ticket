import type { CategoryEntity } from './category-entity';

export interface CategoriesRepository {
  findAll(): Promise<CategoryEntity[]>;
}
