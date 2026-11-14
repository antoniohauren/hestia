import { expect, test } from 'bun:test';
import { computeChange, splitEqual } from './money';

test('splitEqual sums exactly and front-loads remainder', () => {
  expect(splitEqual(10000, 3)).toEqual([3334, 3333, 3333]);
  expect(splitEqual(10001, 3)).toEqual([3334, 3334, 3333]);
  expect(splitEqual(500, 1)).toEqual([500]);
  for (const [t, n] of [[1, 4], [9999, 7], [123457, 11], [0, 3]]) {
    const parts = splitEqual(t, n);
    expect(parts).toHaveLength(n);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(t);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  }
  expect(() => splitEqual(100, 0)).toThrow();
});

test('computeChange', () => {
  expect(computeChange(3750, 5000)).toBe(1250);
  expect(computeChange(3750, 3750)).toBe(0);
  expect(computeChange(3750, 2000)).toBeNull();
});
