export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

type Searchable = { name: string; categoryName: string; variants?: { name: string | null }[] };

const words = (query: string) => norm(query).split(/\s+/).filter(Boolean);
const variantNames = (it: Searchable) => (it.variants ?? []).map((v) => v.name ?? '').join(' ');

/** Items whose name + variants + category contain every query word (accent/case-insensitive). Name/variant matches first. */
export function searchItems<T extends Searchable>(items: T[], query: string): T[] {
  const ws = words(query);
  if (!ws.length) return [];
  const hits = items.filter((it) => {
    const hay = norm(`${it.name} ${variantNames(it)} ${it.categoryName}`);
    return ws.every((w) => hay.includes(w));
  });
  const nameHit = (it: T) => (ws.every((w) => norm(`${it.name} ${variantNames(it)}`).includes(w)) ? 0 : 1);
  return hits.map((it, i) => [it, i] as const).sort((a, b) => nameHit(a[0]) - nameHit(b[0]) || a[1] - b[1]).map(([it]) => it);
}

/** Index of the first variant whose name contains every query word that isn't already in the item name; 0 if none. */
export function matchVariant(item: Searchable, query: string): number {
  const ws = words(query).filter((w) => !norm(item.name).includes(w));
  if (!ws.length) return 0;
  const i = (item.variants ?? []).findIndex((v) => ws.every((w) => norm(v.name ?? '').includes(w)));
  return Math.max(i, 0);
}
