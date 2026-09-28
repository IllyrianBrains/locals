/**
 * Extracts places to visit and things to see from OpenStreetMap (the Geofabrik extracts of Albania and Kosovo,
 * see pbf.ts) for every city in src/data/cities.ts and writes src/data/osm/<slug>.json.
 *
 *   npm run osm                 # all cities
 *   npm run osm -- tirane berat # selected cities
 *   npm run osm -- --offline    # skip Wikimedia: use only what is already in .cache/osm/wiki.json
 *
 * Places are then enriched from Wikidata, Wikipedia and Wikimedia Commons (see enrich-wiki.ts).
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { cities, type City } from '../src/data/cities.ts';
import { enrichPlaces } from './enrich-wiki.ts';
import { dedupe, isPlace, toPlace, type OverpassElement } from './osm-common.ts';
import { readPbf, type PbfCountry } from './pbf.ts';
import type { OsmPlace, OsmCityData } from '../src/data/places.ts';

const OUT_DIR = new URL('../src/data/osm/', import.meta.url);
const MAX_PLACES = 150;

const PBF_COUNTRY: Record<City['country'], PbfCountry> = { al: 'albania', xk: 'kosovo' };
const extracts = new Map<PbfCountry, Promise<OverpassElement[]>>();
const extractOf = (city: City) => {
  const country = PBF_COUNTRY[city.country];
  if (!extracts.has(country)) extracts.set(country, readPbf(country));
  return extracts.get(country)!;
};

/** Metres between two points, close enough at this scale for a search radius. */
function metersFrom(city: City, lat: number, lon: number): number {
  const dLat = (lat - city.osm.lat) * 111_320;
  const dLon = (lon - city.osm.lon) * 111_320 * Math.cos((city.osm.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

async function processCity(city: City, offline: boolean): Promise<void> {
  const nearby = (await extractOf(city)).filter((e) => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    return lat !== undefined && lon !== undefined && isPlace(e.tags ?? {}) && metersFrom(city, lat, lon) <= city.osm.radius;
  });

  // Negative scores are mostly small busts, plaques and unnamed-looking artworks.
  const places = dedupe(nearby.map(toPlace).filter((p): p is OsmPlace => p !== null && p.score >= 0))
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
  console.log(`✓ ${city.name}: ${nearby.length} nearby → ${places.length} places (${byCategory}); ${withSummary} summaries, ${withImage} images`);
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

await mkdir(new URL('../.cache/osm/', import.meta.url), { recursive: true }); // Wikimedia cache
await mkdir(OUT_DIR, { recursive: true });
for (const city of selected) {
  try {
    await processCity(city, offline);
  } catch (error) {
    console.error(`✗ ${city.name}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
