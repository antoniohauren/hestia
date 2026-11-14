/** Offset (ms) of `timeZone` from UTC at instant `ts`. */
function tzOffset(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ts);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ts / 1000) * 1000;
}

/** [start, end) unix ms of local day `YYYY-MM-DD` in `timeZone`. */
export function localDayRange(date: string, timeZone: string): [number, number] {
  const [y, m, d] = date.split('-').map(Number);
  const startUtc = Date.UTC(y, m - 1, d);
  const endUtc = Date.UTC(y, m - 1, d + 1);
  return [startUtc - tzOffset(startUtc, timeZone), endUtc - tzOffset(endUtc, timeZone)];
}
