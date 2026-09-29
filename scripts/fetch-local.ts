/**
 * Extracts local businesses from OpenStreetMap (the Geofabrik extracts, see pbf.ts) for every city in
 * src/data/cities.ts and writes src/data/local/<slug>.json: guesthouses (bujtina), traditional restaurants and
 * cafés, wine cellars, farms and craftspeople. A business belongs to a city when it lies inside its municipality
 * outline (src/data/municipalities.json), so villages around the town are included.
 *
 *   npm run local                 # all cities
 *   npm run local -- berat kukes  # selected cities
 *
 * Run `npm run boundaries` first if municipalities.json is missing. Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cities, type City } from '../src/data/cities.ts';
import type { LocalCityData, LocalKind, LocalPlace } from '../src/data/local.ts';
import { contains, normalize, toLocal, type Outline, type OverpassElement } from './osm-common.ts';
import { readPbf, type PbfCountry } from './pbf.ts';

const OUT_DIR = new URL('../src/data/local/', import.meta.url);
const PER_KIND = 40;
const PBF_COUNTRY: Record<City['country'], PbfCountry> = { al: 'albania', xk: 'kosovo' };

const municipalities = JSON.parse(await readFile(new URL('../src/data/municipalities.json', import.meta.url), 'utf8')) as {
  features: { properties: { id: number }; geometry: Outline }[];
};

const extracts = new Map<PbfCountry, Promise<LocalPlace[]>>();
const localOf = (city: City) => {
  const country = PBF_COUNTRY[city.country];
  if (!extracts.has(country)) extracts.set(country, readPbf(country, 'local').then((els: OverpassElement[]) => els.map((e) => toLocal(e)).filter((p): p is LocalPlace => p !== null)));
  return extracts.get(country)!;
};

const metresBetween = (city: City, p: LocalPlace) => Math.hypot((p.lat - city.osm.lat) * 111_320, (p.lon - city.osm.lon) * 111_320 * Math.cos((city.osm.lat * Math.PI) / 180));

/** The same business is often mapped twice (a node in its own building): keep the better-documented one. */
function dedupe(places: LocalPlace[]): LocalPlace[] {
  const kept: LocalPlace[] = [];
  for (const place of [...places].sort((a, b) => b.score - a.score)) {
    if (!kept.some((k) => k.kind === place.kind && normalize(k.name) === normalize(place.name) && metresBetween({ osm: { lat: k.lat, lon: k.lon } } as City, place) < 300)) kept.push(place);
  }
  return kept;
}

async function processCity(city: City): Promise<void> {
  const outline = municipalities.features.find((f) => f.properties.id === city.osm.boundary)?.geometry;
  if (!outline) throw new Error(`no outline for boundary ${city.osm.boundary}: run npm run boundaries`);
  const inside = (await localOf(city)).filter((p) => contains(outline, [p.lon, p.lat]));
  const places = (['stay', 'food', 'craft'] as LocalKind[]).flatMap((kind) =>
    dedupe(inside.filter((p) => p.kind === kind))
      .map((p) => ({ ...p, km: Math.round(metresBetween(city, p) / 100) / 10 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sq'))
      .slice(0, PER_KIND));
  const data: LocalCityData = {
    city: city.slug,
    name: city.name,
    fetchedAt: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL-1.0',
    count: places.length,
    places,
  };
  await writeFile(new URL(`${city.slug}.json`, OUT_DIR), JSON.stringify(data, null, 2) + '\n');
  const byKind = (['stay', 'food', 'craft'] as LocalKind[]).map((k) => `${k} ${places.filter((p) => p.kind === k).length}`).join(', ');
  console.log(`✓ ${city.name}: ${inside.length} in the municipality → ${places.length} (${byKind})`);
}

const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unknown = slugs.filter((s) => !cities.some((c) => c.slug === s));
if (unknown.length) {
  console.error(`Unknown city: ${unknown.join(', ')}. Known: ${cities.map((c) => c.slug).join(', ')}`);
  process.exit(1);
}
await mkdir(OUT_DIR, { recursive: true });
for (const city of slugs.length ? cities.filter((c) => slugs.includes(c.slug)) : cities) {
  try { await processCity(city); } catch (error) { console.error(`✗ ${city.name}:`, error instanceof Error ? error.message : error); process.exitCode = 1; }
}
