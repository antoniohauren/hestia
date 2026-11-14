const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (cents: number) => brlFmt.format(cents / 100);

/** One price when every variant costs the same (e.g. soda flavors), else "Copo R$ 7,00 / Jarra R$ 15,00". */
export function priceLabel(variants: { name: string | null; priceCents: number }[]) {
  if (new Set(variants.map((v) => v.priceCents)).size <= 1) return variants.length ? brl(variants[0].priceCents) : '';
  return variants.map((v) => `${v.name ? v.name + ' ' : ''}${brl(v.priceCents)}`).join(' / ');
}

/** "13,50" | "13.50" | "R$ 1.234,56" -> cents. null if not a valid non-negative amount. */
export function parseReais(input: string): number | null {
  let s = input.replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** cents -> "13,50" for prefilling inputs. */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export const time = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dateTime = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Local date as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA');
