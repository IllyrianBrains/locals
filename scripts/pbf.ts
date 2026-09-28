/**
 * Reads the Geofabrik extracts of Albania and Kosovo (https://download.geofabrik.de/europe/) and returns the
 * features the site cares about, shaped like Overpass elements so `toPlace` and `pillarOf` work on them unchanged.
 *
 *   const elements = await readPbf('albania');
 *
 * The extracts are downloaded to .cache/pbf/ on first use. Features are pulled out with GDAL's `ogr2ogr`
 * (https://gdal.org/drivers/vector/osm.html), once per layer, and the result is cached next to the PBF.
 * Delete .cache/pbf/ to fetch a fresh extract.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — attribution must be shown wherever it is used.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { USER_AGENT, type OverpassElement } from './osm-common.ts';

const run = promisify(execFile);
const CACHE_DIR = new URL('../.cache/pbf/', import.meta.url);
const CONFIG = new URL('./osmconf.ini', import.meta.url);

export type PbfCountry = 'albania' | 'kosovo';
const EXTRACT_URL = (country: PbfCountry) => `https://download.geofabrik.de/europe/${country}-latest.osm.pbf`;

/**
 * Coarse OGR SQL filter: everything that could be a place worth visiting (osm-common.ts `isPlace`) or a
 * sustainable-tourism feature (`pillarOf`). The exact rules are applied afterwards on the tags.
 */
const WHERE = [
  `tourism IN ('attraction','museum','gallery','viewpoint','artwork','zoo','theme_park','alpine_hut','wilderness_hut','camp_site','guest_house','farm_stay','chalet','wine_cellar')`,
  `historic IS NOT NULL`,
  `heritage IS NOT NULL`,
  `leisure IN ('park','garden','nature_reserve')`,
  `amenity IN ('theatre','arts_centre','marketplace','planetarium','place_of_worship','bus_station','bicycle_rental')`,
  `natural IN ('peak','cave_entrance','spring','beach')`,
  `waterway = 'waterfall'`,
  `boundary IN ('national_park','protected_area')`,
  `craft IS NOT NULL`,
  `shop IN ('farm','craft')`,
  `railway IN ('station','halt')`,
  `route IN ('hiking','foot','bicycle','mtb')`,
  `man_made IN ('tower','lighthouse')`,
].join(' OR ');

const LAYERS = ['points', 'lines', 'multipolygons', 'multilinestrings'] as const;
type Layer = (typeof LAYERS)[number];

type Position = number[];
interface GeoJsonFeature { properties: Record<string, string | Record<string, string> | null>; geometry: { type: string; coordinates: unknown } | null }

const exists = (url: URL) => access(url).then(() => true, () => false);

async function download(country: PbfCountry): Promise<URL> {
  const file = new URL(`${country}-latest.osm.pbf`, CACHE_DIR);
  if (await exists(file)) return file;
  console.log(`Downloading ${EXTRACT_URL(country)} …`);
  const res = await fetch(EXTRACT_URL(country), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${EXTRACT_URL(country)} → HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Bounding-box centre, the same point Overpass reports as `center` for ways and relations. */
function centre(coordinates: unknown): { lat: number; lon: number } | undefined {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const visit = (node: unknown) => {
    if (typeof (node as Position)[0] === 'number') {
      const [lon, lat] = node as Position;
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    } else for (const child of node as unknown[]) visit(child);
  };
  visit(coordinates);
  return Number.isFinite(minLon) ? { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 } : undefined;
}

/** The layer's features as a JSON Lines file, extracted once and reused while it is newer than the PBF. */
async function extractLayer(country: PbfCountry, pbf: URL, layer: Layer): Promise<URL> {
  const out = new URL(`${country}-${layer}.geojsonl`, CACHE_DIR);
  if (await exists(out) && (await stat(out)).mtimeMs > (await stat(pbf)).mtimeMs) return out;
  console.log(`  ${country}: reading ${layer} …`);
  try {
    await run('ogr2ogr', [
      '-f', 'GeoJSONSeq', '-lco', 'RS=NO', '--config', 'OSM_MAX_TMPFILE_SIZE', '2000',
      '-oo', `CONFIG_FILE=${CONFIG.pathname}`, '-where', WHERE, out.pathname, pbf.pathname, layer,
    ], { maxBuffer: 1 << 26 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('ogr2ogr (GDAL) is required to read .osm.pbf files: install it, e.g. `sudo apt install gdal-bin`');
    throw error;
  }
  return out;
}

function toElement(layer: Layer, feature: GeoJsonFeature): OverpassElement | null {
  const p = feature.properties;
  const id = Number((layer === 'multipolygons' ? p.osm_id ?? p.osm_way_id : p.osm_id) ?? 0);
  const type = layer === 'points' ? 'node' : layer === 'lines' ? 'way' : layer === 'multilinestrings' || p.osm_id ? 'relation' : 'way';
  // Every tag is in `all_tags` (raw keys like "name:sq"); the plain fields only cover the keys named in osmconf.ini.
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(p)) if (typeof value === 'string' && !['osm_id', 'osm_way_id'].includes(key)) tags[key] = value;
  if (p.all_tags && typeof p.all_tags === 'object') Object.assign(tags, p.all_tags);
  const at = feature.geometry && centre(feature.geometry.coordinates);
  if (!id || !at) return null;
  return type === 'node' ? { type, id, lat: at.lat, lon: at.lon, tags } : { type, id, center: at, tags };
}

/** Features of one country as Overpass-shaped elements, ready for `toPlace` / `pillarOf` and the exact tag filters. */
export async function readPbf(country: PbfCountry): Promise<OverpassElement[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const pbf = await download(country);
  const elements: OverpassElement[] = [];
  for (const layer of LAYERS) {
    const file = await extractLayer(country, pbf, layer);
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      if (!line) continue;
      const element = toElement(layer, JSON.parse(line));
      if (element) elements.push(element);
    }
  }
  return elements;
}
