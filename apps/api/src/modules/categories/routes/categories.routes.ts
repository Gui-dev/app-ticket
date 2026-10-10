import {
  type CategoryDto,
  listCategoriesResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import type { CategoriesRepository } from '../domain/categories-repository.js';
import type { CategoryEntity } from '../domain/category-entity.js';
import { ListCategoriesUseCase } from '../use-cases/list-categories.use-case.js';

function toCategoryDto(entity: CategoryEntity): CategoryDto {
  return { slug: entity.slug, name: entity.name };
}

export function registerCategoryRoutes(
  app: FastifyInstance,
  categoriesRepository: CategoriesRepository,
): void {
  const useCase = new ListCategoriesUseCase(categoriesRepository);

  app.get('/categories', async () => {
    const list = await useCase.execute();
    return listCategoriesResponseSchema.parse({
      categories: list.map(toCategoryDto),
    });
  });
}
