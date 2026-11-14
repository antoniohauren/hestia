import { expect, test } from 'bun:test';
import { localDayRange } from './dates';

test('localDayRange in São Paulo (UTC-3)', () => {
  const [s, e] = localDayRange('2026-11-13', 'America/Sao_Paulo');
  expect(new Date(s).toISOString()).toBe('2026-11-13T03:00:00.000Z');
  expect(new Date(e).toISOString()).toBe('2026-11-14T03:00:00.000Z');
});
