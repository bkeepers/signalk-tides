import type { TideExtreme } from './types';

/** Given a list of tide extremes, estimate the height at a specific time. */
export function approximateTideHeightAt(extremes: TideExtreme[], time: Date): number | null {
  const sorted = extremes.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const prev = sorted.filter(h => new Date(h.time) <= time).at(-1);
  const next = sorted.filter(h => new Date(h.time) >= time).at(0);

  if (!prev) throw new Error("Missing height data before " + time.toISOString());
  if (!next) throw new Error("Missing height data after " + time.toISOString());

  const progress = (time.getTime() - new Date(prev.time).getTime()) /
    (new Date(next.time).getTime() - new Date(prev.time).getTime());

  const value = interpolate(prev.value, next.value, easeSine(progress));

  return parseFloat(value.toFixed(3));
}

/** Interpolate between two values using the given progress (0-1). */
function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function easeSine(progress: number) {
  // Map progress [0..1] to angle [0..π]
  const angle = progress * Math.PI;
  // Use sine to ease in/out
  return (1 - Math.cos(angle)) / 2;
}
