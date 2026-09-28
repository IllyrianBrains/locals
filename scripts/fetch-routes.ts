/**
 * Extracts the marked walking routes (hiking and foot route relations) of Albania and Kosovo from the Geofabrik
 * extracts (see pbf.ts) and writes src/data/routes.json: name, length and a simplified line for each one, for the maps.
 *
 *   npm run routes
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { writeFile } from 'node:fs/promises';
import { readLayer, type PbfCountry } from './pbf.ts';
import type { Route } from '../src/data/routes.ts';

const OUT_FILE = new URL('../src/data/routes.json', import.meta.url);
/** Douglas–Peucker tolerance in degrees (~20 m): invisible on a country map, and keeps the file small. */
const TOLERANCE = 0.0002;
const COUNTRIES: [PbfCountry, Route['country']][] = [['albania', 'al'], ['kosovo', 'xk']];

type Point = [number, number];

function simplify(line: Point[], tolerance: number): Point[] {
  if (line.length < 3) return line;
  const [ax, ay] = line[0], [bx, by] = line[line.length - 1];
  const length = Math.hypot(bx - ax, by - ay);
  let far = 0, index = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const [x, y] = line[i];
    const d = length === 0 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length;
    if (d > far) { far = d; index = i; }
  }
  if (far <= tolerance) return [line[0], line[line.length - 1]];
  return [...simplify(line.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(line.slice(index), tolerance)];
}

function lengthKm(line: Point[]): number {
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    const [lon1, lat1] = line[i - 1], [lon2, lat2] = line[i];
    km += Math.hypot((lat2 - lat1) * 111.32, (lon2 - lon1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)));
  }
  return km;
}

const routes: Route[] = [];
for (const [country, code] of COUNTRIES) {
  for (const feature of await readLayer(country, 'multilinestrings')) {
    const tags = (feature.properties.all_tags ?? {}) as Record<string, string>;
    if (!['hiking', 'foot'].includes(tags.route) || feature.geometry?.type !== 'MultiLineString') continue;
    const raw = feature.geometry.coordinates as Point[][];
    const measured = raw.reduce((sum, line) => sum + lengthKm(line), 0);
    const lines = raw.map((line) => simplify(line, TOLERANCE).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as Point)).filter((line) => line.length > 1);
    if (!lines.length || measured < 0.3) continue;
    const tagged = parseFloat(tags.distance);
    const all = lines.flat();
    const route: Route = {
      id: Number(feature.properties.osm_id),
      country: code,
      name: tags['name:sq'] ?? tags.name ?? (tags.from && tags.to ? `${tags.from} – ${tags.to}` : undefined),
      ref: tags.ref,
      network: (['iwn', 'nwn', 'rwn', 'lwn'].includes(tags.network) ? tags.network : undefined) as Route['network'],
      operator: tags.operator,
      // The tagged length covers the whole route; the measured one only what lies inside this country.
      km: Math.round((tagged > 0 ? tagged : measured) * 10) / 10,
      bbox: [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))],
      lines,
    };
    for (const key of Object.keys(route) as (keyof Route)[]) if (route[key] === undefined) delete route[key];
    routes.push(route);
  }
}

routes.sort((a, b) => Number(!!b.name) - Number(!!a.name) || b.km - a.km);
await writeFile(OUT_FILE, JSON.stringify({ attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', fetchedAt: new Date().toISOString(), routes }) + '\n');
const points = routes.reduce((sum, r) => sum + r.lines.reduce((s, l) => s + l.length, 0), 0);
console.log(`✓ ${routes.length} routes (${routes.filter((r) => r.name).length} named, ${routes.reduce((s, r) => s + r.km, 0).toFixed(0)} km), ${points} points`);
