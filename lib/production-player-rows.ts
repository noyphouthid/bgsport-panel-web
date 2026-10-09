const PRODUCTION_SIZE_ORDER = [
  "xs", "jxs", "js", "jm", "jl", "jxl", "j2xl",
  "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "6xl",
] as const;

const sizeRanks = new Map<string, number>(
  PRODUCTION_SIZE_ORDER.map((size, index) => [size, index])
);

export function sortProductionPlayerRowsBySize<T extends { size: string }>(rows: readonly T[]): T[] {
  // Sort a copy so editing keeps its input order. Equal sizes keep their original order.
  return [...rows].sort((a, b) =>
    (sizeRanks.get(a.size) ?? PRODUCTION_SIZE_ORDER.length) -
    (sizeRanks.get(b.size) ?? PRODUCTION_SIZE_ORDER.length)
  );
}
