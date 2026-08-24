import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryTree, resolveCategoryLabel } from '../categoryTree';
import { Category } from '../types';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c1', kind: 'expense', name: 'Food', order: 0, ...overrides };
}

describe('buildCategoryTree', () => {
  test('groups subcategories under their main category, scoped by kind', () => {
    const categories: Category[] = [
      makeCategory({ id: 'food', kind: 'expense', name: 'Food', order: 0 }),
      makeCategory({ id: 'junk', kind: 'expense', name: 'Junk', parentId: 'food', order: 0 }),
      makeCategory({ id: 'fruit', kind: 'expense', name: 'Fruit', parentId: 'food', order: 1 }),
      makeCategory({ id: 'salary', kind: 'income', name: 'Salary', order: 0 }),
    ];

    const expenseTree = buildCategoryTree(categories, 'expense');
    assert.equal(expenseTree.length, 1);
    assert.equal(expenseTree[0].category.name, 'Food');
    assert.deepEqual(
      expenseTree[0].children.map((c) => c.name),
      ['Junk', 'Fruit']
    );

    const incomeTree = buildCategoryTree(categories, 'income');
    assert.equal(incomeTree.length, 1);
    assert.equal(incomeTree[0].category.name, 'Salary');
  });

  test('subcategories are not shared across unrelated main categories (REQ-M012)', () => {
    const categories: Category[] = [
      makeCategory({ id: 'food', kind: 'expense', name: 'Food' }),
      makeCategory({ id: 'transport', kind: 'expense', name: 'Transport' }),
      makeCategory({ id: 'junk', kind: 'expense', name: 'Junk', parentId: 'food' }),
    ];
    const tree = buildCategoryTree(categories, 'expense');
    const transportNode = tree.find((n) => n.category.id === 'transport');
    assert.equal(transportNode?.children.length, 0);
  });
});

describe('resolveCategoryLabel', () => {
  test('resolves a valid categoryId to its name', () => {
    const categories = [makeCategory({ id: 'food', name: 'Food' })];
    assert.equal(resolveCategoryLabel('food', categories), 'Food');
  });

  test('resolves an absent categoryId to Uncategorized', () => {
    assert.equal(resolveCategoryLabel(undefined, []), 'Uncategorized');
  });

  test('resolves a categoryId pointing at a deleted category to Uncategorized (REQ-M015)', () => {
    assert.equal(resolveCategoryLabel('does-not-exist', []), 'Uncategorized');
  });
});
