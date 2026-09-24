/**
 * Builds the region map: every municipality of Albania (Bashki) and Kosovo (Komuna) with its outline and
 * a 1–5 level of how much there is to see, and writes src/data/municipalities.json.
 *
 *   npm run boundaries             # fetch and build
 *   npm run boundaries -- --offline  # rebuild from the responses cached in .cache/boundaries/
 *
 * 1. Lists the municipalities from Overpass, with their seat to get a plain city name.
 * 2. Pulls every place worth visiting in each country (same filters and scoring as fetch-osm.ts).
 * 3. Fetches simplified outlines from Nominatim.
 * 4. Places each point in its municipality and sums the scores into a level.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cities } from '../src/data/cities.ts';
import { dedupe, fetchOverpass, placeFilters, toPlace, USER_AGENT, type OverpassElement } from './osm-common.ts';
import type { OsmPlace } from '../src/data/places.ts';

const CACHE_DIR = new URL('../.cache/boundaries/', import.meta.url);
const OUT_FILE = new URL('../src/data/municipalities.json', import.meta.url);
/** Nominatim simplification tolerance in degrees (~300 m); plenty for a country-scale map. */
const THRESHOLD = 0.003;
const COUNTRIES = [
  // Albanian seats carry the definite form in name:sq ("Durrësi"), Kosovar seats their Albanian name there.
  { code: 'al', iso: 'AL', adminLevel: 7, prefix: /^Bashkia /, keep: /^Bashkia /, seatName: ['name', 'name:sq'] },
  { code: 'xk', iso: 'XK', adminLevel: 6, prefix: /^Komuna e /, keep: /^Komuna /, seatName: ['name:sq', 'name'] },
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

const placesQuery = (iso: string) => `[out:json][timeout:300];
area["ISO3166-1"="${iso}"][admin_level=2]->.c;
(
${placeFilters('(area.c)')}
);
out center tags;`;

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
const municipalities: { id: number; name: string; area: string; country: string; geometry: Geometry; places: OsmPlace[] }[] = [];
let allPlaces: OsmPlace[] = [];

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
    municipalities.push({ id: rel.id, name, area, country: country.code, geometry, places: [] });
  }
  if (i > 0 && !offline) await new Promise((r) => setTimeout(r, 5000));
  const raw = await cached(`${country.code}-places`, () => fetchOverpass(placesQuery(country.iso)));
  allPlaces = allPlaces.concat(raw.elements.map((e: OverpassElement) => toPlace(e)).filter((p): p is OsmPlace => p !== null && p.score >= 0));
}

// Negative scores are mostly small busts and plaques; duplicates are features mapped twice.
const places = dedupe(allPlaces);
let unplaced = 0;
for (const place of places) {
  const home = municipalities.find((m) => contains(m.geometry, [place.lon, place.lat]));
  if (home) home.places.push(place); else unplaced++;
}

// Levels by rank, so the map uses its whole range of tones: the top fifth is "ff", the next fifth "f", and so on.
// Municipalities with nothing mapped stay at level 1.
const scoreOf = (m: (typeof municipalities)[number]) => m.places.reduce((sum, p) => sum + p.score + 1, 0);
const ranked = [...municipalities].sort((a, b) => scoreOf(a) - scoreOf(b));
const guideSlugs = new Map(cities.map((city) => [city.osm.boundary, city.slug]));

const features = municipalities.map((m) => {
  const score = scoreOf(m);
  const level = score === 0 ? 1 : Math.min(5, 1 + Math.floor((ranked.indexOf(m) / ranked.length) * 5));
  const top = m.places.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sq')).slice(0, 3).map((p) => p.name);
  const geometry = m.geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: round(m.geometry.coordinates) }
    : { type: 'MultiPolygon', coordinates: m.geometry.coordinates.map(round) };
  return { type: 'Feature', properties: { id: m.id, slug: guideSlugs.get(m.id) ?? slugify(m.name), name: m.name, area: m.area, country: m.country, guide: guideSlugs.has(m.id), count: m.places.length, score, level, top }, geometry };
}).sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'sq'));

for (const city of cities) if (!municipalities.some((m) => m.id === city.osm.boundary)) console.warn(`✗ ${city.slug}: its boundary ${city.osm.boundary} is not in the list`);
await writeFile(OUT_FILE, JSON.stringify({ type: 'FeatureCollection', attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', fetchedAt: new Date().toISOString(), features }) + '\n');

const perLevel = [1, 2, 3, 4, 5].map((l) => `${l}: ${features.filter((f) => f.properties.level === l).length}`).join(', ');
console.log(`✓ ${features.length} municipalities (${COUNTRIES.map((c) => `${c.code} ${features.filter((f) => f.properties.country === c.code).length}`).join(', ')}), ${places.length} places (${unplaced} outside every outline); levels ${perLevel}`);
