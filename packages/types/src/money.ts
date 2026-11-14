/** n integer parts summing exactly to totalCents; remainder cents go to the first parts. */
export function splitEqual(totalCents: number, n: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('total inválido');
  if (!Number.isInteger(n) || n < 1) throw new Error('número de partes inválido');
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Troco. Returns null when the cash received does not cover the amount. */
export function computeChange(amountCents: number, receivedCents: number): number | null {
  return receivedCents >= amountCents ? receivedCents - amountCents : null;
}

export function lineTotal(item: { unitPriceCents: number; quantity: number }) {
  return item.unitPriceCents * item.quantity;
}
