/**
 * Builds the region map: every municipality of Albania (Bashki) and Kosovo (Komuna) with its outline and
 * a 1–5 level of how much it offers for sustainable tourism, and writes src/data/municipalities.json.
 *
 *   npm run boundaries             # fetch and build
 *   npm run boundaries -- --offline  # rebuild from the responses cached in .cache/boundaries/
 *
 * 1. Lists the municipalities from Overpass, with their seat to get a plain city name.
 * 2. Reads the sustainable-tourism features of each country from its Geofabrik .osm.pbf extract (scripts/pbf.ts):
 *    protected nature, trails, heritage, local businesses and ways to arrive without a car (`pillarOf` in osm-common.ts).
 * 3. Fetches simplified outlines from Nominatim.
 * 4. Places each feature in its municipality, counts them per pillar and turns the counts into a level.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cities } from '../src/data/cities.ts';
import { fetchOverpass, normalize, pillarOf, pillars, USER_AGENT } from './osm-common.ts';
import { readPbf } from './pbf.ts';
import type { Pillar } from '../src/data/places.ts';

const CACHE_DIR = new URL('../.cache/boundaries/', import.meta.url);
const OUT_FILE = new URL('../src/data/municipalities.json', import.meta.url);
/** Nominatim simplification tolerance in degrees (~300 m); plenty for a country-scale map. */
const THRESHOLD = 0.003;
const COUNTRIES = [
  // Albanian seats carry the definite form in name:sq ("Durrësi"), Kosovar seats their Albanian name there.
  { code: 'al', pbf: 'albania', iso: 'AL', adminLevel: 7, prefix: /^Bashkia /, keep: /^Bashkia /, seatName: ['name', 'name:sq'] },
  { code: 'xk', pbf: 'kosovo', iso: 'XK', adminLevel: 6, prefix: /^Komuna e /, keep: /^Komuna /, seatName: ['name:sq', 'name'] },
] as const;

type Ring = [number, number][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
interface Relation { type: 'relation'; id: number; tags: Record<string, string>; members: { type: string; ref: number; role: string }[] }

const offline = process.argv.includes('--offline');

/** Returns the cached response for `name`, or calls `load` and caches it. */
async function cached<T>(name: string, load: () => Promise<T>): Promise<T> {
  const file = new URL(name + '.json', CACHE_DIR);
  const hit = await readFile(file, 'utf8').catch(() => null);
  if (hit) return JSON.parse(hit);
  if (offline) throw new Error(`no cached ${name} yet; run \`npm run boundaries\` online first`);
  const data = await load();
  await writeFile(file, JSON.stringify(data));
  return data;
}

const municipalityQuery = (iso: string, level: number) => `[out:json][timeout:120];
area["ISO3166-1"="${iso}"][admin_level=2]->.c;
rel(area.c)["boundary"="administrative"]["admin_level"="${level}"]->.m;
.m out body;
node(r.m:"admin_centre");
out tags;`;

async function nominatimOutlines(ids: number[]): Promise<Map<number, Geometry>> {
  const outlines = new Map<number, Geometry>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL('https://nominatim.openstreetmap.org/lookup');
    url.search = new URLSearchParams({ osm_ids: ids.slice(i, i + 50).map((id) => 'R' + id).join(','), format: 'jsonv2', polygon_geojson: '1', polygon_threshold: String(THRESHOLD) }).toString();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim → HTTP ${res.status}`);
    for (const r of (await res.json()) as { osm_id: number; geojson: Geometry }[]) outlines.set(r.osm_id, r.geojson);
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim allows one request per second
  }
  return outlines;
}

const round = (rings: Ring[]) => rings.map((ring) => ring.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number]));

function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (point: [number, number], rings: Ring[]) => inRing(point, rings[0]) && !rings.slice(1).some((hole) => inRing(point, hole));
const contains = (g: Geometry, point: [number, number]) => g.type === 'Polygon' ? inPolygon(point, g.coordinates) : g.coordinates.some((p) => inPolygon(point, p));

const slugify = (s: string) => s.toLocaleLowerCase('sq').replaceAll('ë', 'e').replaceAll('ç', 'c').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await mkdir(CACHE_DIR, { recursive: true });
interface Feature { pillar: Pillar; name?: string; notable: boolean; point: [number, number] }
const municipalities: { id: number; name: string; area: string; country: string; population?: number; geometry: Geometry; features: Feature[] }[] = [];
let allFeatures: Feature[] = [];

for (const [i, country] of COUNTRIES.entries()) {
  if (i > 0 && !offline) await new Promise((r) => setTimeout(r, 5000)); // be polite to the public Overpass servers
  const listed = await cached(`${country.code}-municipalities`, () => fetchOverpass(municipalityQuery(country.iso, country.adminLevel)));
  const seats = new Map(listed.elements.filter((e) => e.type === 'node').map((e) => [e.id, e.tags ?? {}]));
  // Overpass areas overlap at the borders, so neighbours' units show up too: keep this country's naming only.
  const relations = (listed.elements as unknown as Relation[]).filter((e) => e.type === 'relation' && country.keep.test(e.tags['name:sq'] ?? e.tags.name ?? ''));
  const outlines = await cached(`${country.code}-outlines`, async () => [...await nominatimOutlines(relations.map((r) => r.id))]).then((list) => new Map(list));
  for (const rel of relations) {
    const geometry = outlines.get(rel.id);
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) { console.warn(`✗ ${rel.tags.name}: no outline`); continue; }
    const seat = rel.members.find((m) => m.role === 'admin_centre' && m.type === 'node');
    const seatTags = seat ? seats.get(seat.ref) : undefined;
    // The map names the town: "Komuna e Pejës / Opština Peć" → its seat "Pejë", "Bashkia Tropojë" → "Bajram Curri".
    // Without a seat, "Bashkia Kavajë" is already plain after the prefix.
    const area = (rel.tags['name:sq'] ?? rel.tags.name).split(' / ')[0];
    const seatName = seatTags && country.seatName.map((key) => seatTags[key]).find(Boolean);
    const name = (seatName ?? area.replace(country.prefix, '')).split(' / ')[0];
    municipalities.push({ id: rel.id, name, area, country: country.code, population: Number(rel.tags.population) || undefined, geometry, features: [] });
  }
  const elements = await readPbf(country.pbf);
  for (const e of elements) {
    const t = e.tags ?? {};
    const pillar = pillarOf(t);
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (pillar && lat !== undefined && lon !== undefined) allFeatures.push({ pillar, name: t['name:sq'] ?? t.name, notable: !!(t.wikidata || t.wikipedia), point: [lon, lat] });
  }
}

let unplaced = 0;
for (const feature of allFeatures) {
  const home = municipalities.find((m) => contains(m.geometry, feature.point));
  if (home) home.features.push(feature); else unplaced++;
}

/** Counts per pillar. A feature mapped twice (a node inside its own outline) counts once: same pillar and name. */
function countPillars(m: (typeof municipalities)[number]): Record<Pillar, number> {
  const counts = Object.fromEntries(pillars.map((p) => [p, 0])) as Record<Pillar, number>;
  const seen = new Set<string>();
  for (const f of m.features) {
    const key = f.name && `${f.pillar}:${normalize(f.name)}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    counts[f.pillar]++;
  }
  return counts;
}

// Each pillar counts by its square root, so a town full of guesthouses does not outrank a valley that is rich in
// nature, trails and heritage: the mix matters more than the sheer number. Levels are by rank, so the map uses its
// whole range of tones: the top fifth is "ff", the next fifth "f", and so on. Nothing mapped stays at level 1.
const pillarsOf = new Map(municipalities.map((m) => [m, countPillars(m)]));
const scoreOf = (m: (typeof municipalities)[number]) => Math.round(10 * pillars.reduce((sum, p) => sum + Math.sqrt(pillarsOf.get(m)![p]), 0));
const ranked = [...municipalities].sort((a, b) => scoreOf(a) - scoreOf(b));
const guideSlugs = new Map(cities.map((city) => [city.osm.boundary, city.slug]));

const features = municipalities.map((m) => {
  const score = scoreOf(m);
  const level = score === 0 ? 1 : Math.min(5, 1 + Math.floor((ranked.indexOf(m) / ranked.length) * 5));
  // Headline features: named nature and heritage first, the ones with a Wikidata/Wikipedia entry before the rest.
  const top = [...new Set(m.features.filter((f) => f.name && (f.pillar === 'nature' || f.pillar === 'heritage')).sort((a, b) => Number(b.notable) - Number(a.notable) || a.name!.localeCompare(b.name!, 'sq')).map((f) => f.name!))].slice(0, 3);
  const counts = pillarsOf.get(m)!;
  const geometry = m.geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: round(m.geometry.coordinates) }
    : { type: 'MultiPolygon', coordinates: m.geometry.coordinates.map(round) };
  return { type: 'Feature', properties: { id: m.id, slug: guideSlugs.get(m.id) ?? slugify(m.name), name: m.name, area: m.area, country: m.country, population: m.population, guide: guideSlugs.has(m.id), count: Object.values(counts).reduce((a, b) => a + b, 0), pillars: counts, score, level, top }, geometry };
}).sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'sq'));

for (const city of cities) if (!municipalities.some((m) => m.id === city.osm.boundary)) console.warn(`✗ ${city.slug}: its boundary ${city.osm.boundary} is not in the list`);
await writeFile(OUT_FILE, JSON.stringify({ type: 'FeatureCollection', attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', fetchedAt: new Date().toISOString(), features }) + '\n');

const perLevel = [1, 2, 3, 4, 5].map((l) => `${l}: ${features.filter((f) => f.properties.level === l).length}`).join(', ');
console.log(`✓ ${features.length} municipalities (${COUNTRIES.map((c) => `${c.code} ${features.filter((f) => f.properties.country === c.code).length}`).join(', ')}), ${allFeatures.length} features (${unplaced} outside every outline); levels ${perLevel}`);
