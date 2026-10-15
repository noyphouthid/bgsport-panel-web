// Derives simplified province geometry for the interactive BG SPORT map.
// Source: Simplemaps, https://simplemaps.com/svg/country/la
// Copyright (c) 2024 Pareto Software, LLC. SVG library license:
// https://simplemaps.com/resources/svg-license
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const sourceUrl = "https://simplemaps.com/static/svg/country/la/admin1/la.svg";
const source = process.argv[2] ? await readFile(process.argv[2], "utf8") : await (await fetch(sourceUrl)).text();
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const anchors = new Map([...source.matchAll(/<circle\b[^>]*>/g)].map(match => attrs(match[0])).filter(value => value.id.startsWith("LA")).map(value => [value.id, [Number(value.cx), Number(value.cy)]]));

function distanceSquared(point, start, end) {
  let x = start[0], y = start[1];
  const dx = end[0] - x, dy = end[1] - y;
  if (dx || dy) {
    const t = Math.max(0, Math.min(1, ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)));
    x += t * dx; y += t * dy;
  }
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function simplify(points, toleranceSquared = 0.36) {
  if (points.length <= 2) return points;
  let max = toleranceSquared, split = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceSquared(points[i], points[0], points.at(-1));
    if (distance > max) { max = distance; split = i; }
  }
  if (split === -1) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, split + 1), toleranceSquared).slice(0, -1), ...simplify(points.slice(split), toleranceSquared)];
}

const provinces = [...source.matchAll(/<path\b[^>]*>/g)].map(match => {
  const { id, d } = attrs(match[0]);
  assert.match(d, /^M[\d. -]+l[\d. -]+z$/);
  const values = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [[values[0], values[1]]];
  for (let i = 2; i < values.length; i += 2) points.push([points.at(-1)[0] + values[i], points.at(-1)[1] + values[i + 1]]);
  points.push(points[0]);
  const cleaned = simplify(points);
  const path = cleaned.map((point, i) => `${i ? "L" : "M"}${point.map(value => Math.round(value * 10) / 10).join(" ")}`).join("") + "Z";
  assert.ok(anchors.has(id));
  return { id, path, label: anchors.get(id) };
});
assert.equal(provinces.length, 18);
assert.equal(new Set(provinces.map(province => province.id)).size, 18);
await mkdir(new URL("../lib/maps/", import.meta.url), { recursive: true });
await writeFile(new URL("../lib/maps/laos-provinces.json", import.meta.url), JSON.stringify({ source: sourceUrl, viewBox: "80 30 850 1000", provinces }) + "\n");
console.log(`Prepared ${provinces.length} province paths (${provinces.reduce((sum, province) => sum + province.path.length, 0)} path characters).`);
