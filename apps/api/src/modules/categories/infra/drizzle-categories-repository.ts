import { asc } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { categories } from '../../../db/schema.js';
import type { CategoriesRepository } from '../domain/categories-repository.js';
import type { CategoryEntity } from '../domain/category-entity.js';

export class DrizzleCategoriesRepository implements CategoriesRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<CategoryEntity[]> {
    return this.db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name));
  }
}
