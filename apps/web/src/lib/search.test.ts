import { expect, test } from 'bun:test';
import { matchVariant, norm, searchItems } from './search';

const items = [
  { name: 'Croquete de cupim', categoryName: 'Porções' },
  { name: 'Kani 4 un', categoryName: 'Kani' },
  { name: 'Uramaki kani', categoryName: 'Uramaki' },
  { name: 'Temaki salmão', categoryName: 'Temaki' },
  { name: 'Hot salmão', categoryName: 'Hots' },
  { name: 'Coca-Cola', categoryName: 'Bebidas' },
];
const names = (q: string) => searchItems(items, q).map((i) => i.name);

test('norm strips accents and case', () => {
  expect(norm('  Porções ')).toBe('porcoes');
  expect(norm('SALMÃO')).toBe('salmao');
});

test('accent/case-insensitive and category match', () => {
  expect(names('porcoes')).toEqual(['Croquete de cupim']);
  expect(names('PORÇÕES')).toEqual(['Croquete de cupim']);
  expect(names('kani')).toEqual(['Kani 4 un', 'Uramaki kani']);
});

test('multi-word: every word must match', () => {
  expect(names('salmao temaki')).toEqual(['Temaki salmão']);
  expect(names('salmao')).toEqual(['Temaki salmão', 'Hot salmão']);
  expect(names('salmao bebidas')).toEqual([]);
});

test('name matches rank above category-only matches', () => {
  expect(names('hot')).toEqual(['Hot salmão']);
  expect(searchItems([{ name: 'Filadélfia', categoryName: 'Hots' }, { name: 'Hot roll', categoryName: 'Hots' }], 'hot').map((i) => i.name)).toEqual(['Hot roll', 'Filadélfia']);
  expect(names('   ')).toEqual([]);
});

test('variant names are searchable and preselected', () => {
  const soda = (name: string) => ({ name, categoryName: 'Bebidas', variants: [{ name: 'Coca' }, { name: 'Coca Zero' }, { name: 'Guaraná' }] });
  const menu = [soda('Refri lata'), { name: 'Suco', categoryName: 'Bebidas', variants: [{ name: 'Copo' }] }, soda('Refri litro')];
  expect(searchItems(menu, 'coca').map((i) => i.name)).toEqual(['Refri lata', 'Refri litro']);
  expect(searchItems(menu, 'refri guarana').map((i) => i.name)).toEqual(['Refri lata', 'Refri litro']);
  expect(matchVariant(menu[0], 'coca')).toBe(0);
  expect(matchVariant(menu[0], 'coca zero')).toBe(1);
  expect(matchVariant(menu[0], 'refri guarana')).toBe(2);
  expect(matchVariant(menu[0], 'refri')).toBe(0);
});
