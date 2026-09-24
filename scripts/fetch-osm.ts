/**
 * Extracts places to visit and things to see from OpenStreetMap (Overpass API)
 * for every city in src/data/cities.ts and writes src/data/osm/<slug>.json.
 *
 *   npm run osm                 # all cities
 *   npm run osm -- tirane berat # selected cities
 *   npm run osm -- --offline    # re-process cached raw responses in .cache/osm
 *
 * Places are then enriched from Wikidata, Wikipedia and Wikimedia Commons (see enrich-wiki.ts).
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cities, type City } from '../src/data/cities.ts';
import { enrichPlaces } from './enrich-wiki.ts';
import { dedupe, fetchOverpass, placeFilters, toPlace, type OverpassElement } from './osm-common.ts';
import type { OsmPlace, OsmCityData } from '../src/data/places.ts';

const CACHE_DIR = new URL('../.cache/osm/', import.meta.url);
const OUT_DIR = new URL('../src/data/osm/', import.meta.url);
const MAX_PLACES = 150;

function buildQuery({ osm: { lat, lon, radius } }: City): string {
  return `[out:json][timeout:120];
(
${placeFilters(`(around:${radius},${lat},${lon})`)}
);
out center tags;`;
}

async function processCity(city: City, offline: boolean): Promise<void> {
  const cacheFile = new URL(`${city.slug}.raw.json`, CACHE_DIR);
  let raw: { elements: OverpassElement[] };
  if (offline) {
    const cached = await readFile(cacheFile, 'utf8').catch(() => null);
    if (!cached) throw new Error(`no cached response yet; run \`npm run osm -- ${city.slug}\` online first`);
    raw = JSON.parse(cached);
  } else {
    raw = await fetchOverpass(buildQuery(city));
    await writeFile(cacheFile, JSON.stringify(raw));
  }

  // Negative scores are mostly small busts, plaques and unnamed-looking artworks.
  const places = dedupe(raw.elements.map(toPlace).filter((p): p is OsmPlace => p !== null && p.score >= 0))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sq'))
    .slice(0, MAX_PLACES);
  await enrichPlaces(places, offline);

  const data: OsmCityData = {
    city: city.slug,
    name: city.name,
    center: { lat: city.osm.lat, lon: city.osm.lon },
    radius: city.osm.radius,
    fetchedAt: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL-1.0',
    count: places.length,
    places,
  };
  await writeFile(new URL(`${city.slug}.json`, OUT_DIR), JSON.stringify(data, null, 2) + '\n');

  const byCategory = Object.entries(Object.groupBy(places, (p) => p.category)).map(([c, list]) => `${c} ${list!.length}`).join(', ');
  const withSummary = places.filter((p) => p.summary).length;
  const withImage = places.filter((p) => p.image).length;
  console.log(`✓ ${city.name}: ${raw.elements.length} raw → ${places.length} places (${byCategory}); ${withSummary} summaries, ${withImage} images`);
}

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const slugs = args.filter((a) => !a.startsWith('--'));
const selected = slugs.length ? cities.filter((c) => slugs.includes(c.slug)) : cities;
const unknown = slugs.filter((s) => !cities.some((c) => c.slug === s));
if (unknown.length) {
  console.error(`Unknown city: ${unknown.join(', ')}. Known: ${cities.map((c) => c.slug).join(', ')}`);
  process.exit(1);
}

await mkdir(CACHE_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
for (const [i, city] of selected.entries()) {
  if (i > 0 && !offline) await new Promise((r) => setTimeout(r, 3000)); // be polite to the public Overpass servers
  try {
    await processCity(city, offline);
  } catch (error) {
    console.error(`✗ ${city.name}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
