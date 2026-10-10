import type { CategoriesRepository } from '../domain/categories-repository';
import type { CategoryEntity } from '../domain/category-entity';

export class ListCategoriesUseCase {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async execute(): Promise<CategoryEntity[]> {
    return this.categoriesRepository.findAll();
  }
}
