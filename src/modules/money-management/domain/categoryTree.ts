// Pure domain logic: hierarchical category helpers (REQ-M012-M015).
// No I/O.

import { Category, CategoryKind, UNCATEGORIZED_LABEL } from './types';

export interface CategoryNode {
  category: Category;
  children: Category[];
}

/** Builds a { main category -> its subcategories } tree for one kind (expense or income), REQ-M012/M013. */
export function buildCategoryTree(categories: Category[], kind: CategoryKind): CategoryNode[] {
  const inKind = categories.filter((c) => c.kind === kind);
  const mains = inKind.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
  return mains.map((main) => ({
    category: main,
    children: inKind.filter((c) => c.parentId === main.id).sort((a, b) => a.order - b.order),
  }));
}

/** Resolves a transaction's categoryId to a display name — "Uncategorized" if absent or the category no longer exists (REQ-M015). Never mutates the transaction itself. */
export function resolveCategoryLabel(categoryId: string | undefined, categories: Category[]): string {
  if (!categoryId) return UNCATEGORIZED_LABEL;
  const category = categories.find((c) => c.id === categoryId);
  return category ? category.name : UNCATEGORIZED_LABEL;
}
