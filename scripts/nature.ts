/**
 * Water and protected land per city: lakes, reservoirs, wetlands, rivers, waterfalls, springs, national parks,
 * protected areas and nature reserves, read from the same Geofabrik extracts as the places (see pbf.ts).
 *
 * Unlike places these are not scored and capped: a river or a park is worth showing however few tags it has.
 * Their shapes are kept (simplified) so the city map can draw them.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { contains, normalize, type Outline } from './osm-common.ts';
import { readNature, type GeoJsonFeature, type Layer, type PbfCountry } from './pbf.ts';
import type { NatureFeature, NatureKind } from '../src/data/places.ts';

/** Water this far from the centre counts; protected areas are large, so they count from farther away. */
const WATER_RADIUS_FACTOR = 2;
const PROTECTED_RADIUS_M = 15_000;
const MAX_WATER = 40;
const MAX_PROTECTED = 12;

type Point = [number, number]; // [lon, lat] as in GeoJSON
type Ring = Point[];
type Props = GeoJsonFeature['properties'];
type Center = { lat: number; lon: number };

const tagsOf = (p: Props): Record<string, string> => {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(p)) if (typeof value === 'string') tags[key] = value;
  if (p.all_tags && typeof p.all_tags === 'object') Object.assign(tags, p.all_tags);
  return tags;
};

/** The kind a feature is shown as, or null for what is not worth listing (ponds, pools, river banks drawn as areas). */
function kindOf(t: Record<string, string>, layer: Layer): NatureKind | null {
  if (/^(river|stream|canal)$/.test(t.waterway ?? '')) return layer === 'lines' ? (t.waterway as NatureKind) : null;
  if (t.waterway === 'waterfall') return 'waterfall';
  if (t.boundary === 'national_park') return 'national_park';
  if (t.boundary === 'protected_area' || t.leisure === 'nature_reserve') {
    return t.leisure === 'nature_reserve' || /^(1a|1b|4)$/.test(t.protect_class ?? '') ? 'nature_reserve' : 'protected_area';
  }
  if (t.natural === 'water') {
    if (/^(lake|lagoon|oxbow)$/.test(t.water ?? '') || (!t.water && layer === 'multipolygons')) return 'lake';
    return t.water === 'reservoir' ? 'reservoir' : null;
  }
  if (/^(wetland|bay|spring|hot_spring)$/.test(t.natural ?? '')) return t.natural as NatureKind;
  return null;
}

export const isProtected = (kind: NatureKind) => /^(national_park|protected_area|nature_reserve)$/.test(kind);

const metersBetween = (a: Center, [lon, lat]: Point) =>
  Math.hypot((lat - a.lat) * 111_320, (lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** Douglas–Peucker, tolerance in degrees. */
function simplify(points: Ring, tolerance: number): Ring {
  if (points.length < 3) return points;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-12;
  let far = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((by - ay) * points[i][0] - (bx - ax) * points[i][1] + bx * ay - by * ax) / len;
    if (d > far) { far = d; at = i; }
  }
  if (far <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

/** A closed ring has no baseline (start = end), so it is simplified as two halves. */
function simplifyRing(ring: Ring, tolerance: number): Ring {
  const mid = Math.floor(ring.length / 2);
  return [...simplify(ring.slice(0, mid + 1), tolerance).slice(0, -1), ...simplify(ring.slice(mid), tolerance)];
}

const round = (points: Ring): Ring => points.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]);

/** Shoelace area in km² (equirectangular, fine at this scale). */
function areaKm2(ring: Ring): number {
  const k = Math.cos((ring[0][1] * Math.PI) / 180);
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] * k) * ring[i][1] - (ring[i][0] * k) * ring[j][1];
  return (Math.abs(sum) / 2) * 111.32 * 111.32;
}

const lengthKm = (line: Ring) => line.slice(1).reduce((sum, p, i) => sum + metersBetween({ lat: line[i][1], lon: line[i][0] }, p), 0) / 1000;

interface Candidate { feature: NatureFeature; key: string }

function build(layer: Layer, feature: GeoJsonFeature, city: Center, radius: number): (Candidate & { partial?: boolean }) | null {
  const t = tagsOf(feature.properties);
  const kind = kindOf(t, layer);
  const g = feature.geometry;
  const name = t['name:sq'] ?? t.name;
  const id = Number(feature.properties.osm_id ?? feature.properties.osm_way_id ?? 0);
  if (!kind || !name || !g || !id) return null;
  const limit = isProtected(kind) ? PROTECTED_RADIUS_M : radius * WATER_RADIUS_FACTOR;

  let paths: Ring[];
  let nearM: number;
  let at: Point;
  let area: number | undefined;
  if (g.type === 'Point') {
    at = g.coordinates as Point;
    paths = [];
    nearM = metersBetween(city, at);
  } else if (g.type === 'LineString') {
    const line = g.coordinates as Ring;
    nearM = Math.min(...line.map((p) => metersBetween(city, p)));
    paths = [round(simplify(line, 0.0003))];
    at = line.reduce((best, p) => (metersBetween(city, p) < metersBetween(city, best) ? p : best));
  } else {
    const polygons = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][];
    const outline = { type: 'MultiPolygon', coordinates: polygons } as Outline;
    const inside = contains(outline, [city.lon, city.lat]);
    const outers = polygons.map((rings) => rings[0]);
    at = outers.flat().reduce((best, p) => (metersBetween(city, p) < metersBetween(city, best) ? p : best));
    nearM = inside ? 0 : metersBetween(city, at);
    area = outers.reduce((sum, ring) => sum + areaKm2(ring), 0);
    // Protected areas are big and only need a rough outline; lakes keep more of their shape.
    const tolerance = isProtected(kind) ? 0.001 : 0.0003;
    paths = outers.filter((ring) => areaKm2(ring) > 0.05).map((ring) => round(simplifyRing(ring, tolerance))).filter((ring) => ring.length >= 4);
    if (!paths.length) return null;
  }
  if (nearM > limit) return null;

  const place: NatureFeature = {
    id: `${layer === 'lines' ? 'way' : layer === 'points' ? 'node' : feature.properties.osm_id ? 'relation' : 'way'}/${id}`,
    name,
    kind,
    lat: Number(at[1].toFixed(6)),
    lon: Number(at[0].toFixed(6)),
    nearM: Math.round(nearM),
    areaKm2: area === undefined ? undefined : Number(area.toFixed(area < 10 ? 2 : 0)),
    lengthKm: layer === 'lines' ? Number(lengthKm(g.coordinates as Ring).toFixed(1)) : undefined,
    title: t.protection_title,
    nameEn: t['name:en'],
    wikidata: t.wikidata,
    wikipedia: t.wikipedia,
    paths: paths.length ? paths.map((ring) => ring.map(([lon, lat]): [number, number] => [lat, lon])) : undefined,
    osmUrl: '',
  };
  place.osmUrl = `https://www.openstreetmap.org/${place.id}`;
  for (const key of Object.keys(place) as (keyof NatureFeature)[]) if (place[key] === undefined) delete place[key];
  // Rivers come in many segments and the same park or lake is often two relations: merge on name and kind.
  return { feature: place, key: `${kind === 'stream' || kind === 'canal' ? kind : isProtected(kind) ? 'protected' : kind}:${normalize(name)}` };
}

const cache = new Map<PbfCountry, ReturnType<typeof readNature>>();

/** Water and protected areas around a city, protected areas first (they are the headline), nearest first within each. */
export async function natureNear(country: PbfCountry, city: Center, radius: number): Promise<NatureFeature[]> {
  if (!cache.has(country)) cache.set(country, readNature(country));
  const merged = new Map<string, NatureFeature>();
  for (const { layer, feature } of await cache.get(country)!) {
    const built = build(layer, feature, city, radius);
    if (!built) continue;
    const have = merged.get(built.key);
    if (!have) { merged.set(built.key, built.feature); continue; }
    if (built.feature.kind === 'river' || built.feature.kind === 'stream' || built.feature.kind === 'canal') {
      // Another segment of the same river: extend it.
      have.paths = [...(have.paths ?? []), ...(built.feature.paths ?? [])];
      have.lengthKm = Number(((have.lengthKm ?? 0) + (built.feature.lengthKm ?? 0)).toFixed(1));
      if (built.feature.nearM < have.nearM) Object.assign(have, { nearM: built.feature.nearM, lat: built.feature.lat, lon: built.feature.lon });
      have.wikidata ??= built.feature.wikidata; have.wikipedia ??= built.feature.wikipedia;
    } else if (built.feature.nearM < have.nearM || (built.feature.areaKm2 ?? 0) > (have.areaKm2 ?? 0)) {
      merged.set(built.key, { ...built.feature, wikidata: built.feature.wikidata ?? have.wikidata });
    }
  }
  const rank = (f: NatureFeature) => (f.wikidata ? -1 : 0) + (f.kind === 'stream' || f.kind === 'canal' ? 2 : 0) + (f.kind === 'spring' ? 1 : 0);
  const all = [...merged.values()];
  const byNearness = (a: NatureFeature, b: NatureFeature) => rank(a) - rank(b) || a.nearM - b.nearM;
  return [
    ...all.filter((f) => isProtected(f.kind)).sort(byNearness).slice(0, MAX_PROTECTED),
    ...all.filter((f) => !isProtected(f.kind)).sort(byNearness).slice(0, MAX_WATER),
  ];
}

/**
 * Outlines of every national park, protected area and nature reserve of a country, keyed by OSM id and by name,
 * as [lat, lon] rings. The municipality-wide nature list (fetch-boundaries.ts) only has a point per feature, so it
 * borrows the shape from here and the map can draw an area instead of a dot.
 */
export async function protectedShapes(country: PbfCountry): Promise<{ byId: Map<string, [number, number][][]>; byName: Map<string, [number, number][][]> }> {
  const byId = new Map<string, [number, number][][]>();
  const byName = new Map<string, { paths: [number, number][][]; area: number }>();
  for (const { layer, feature } of await readNature(country)) {
    const g = feature.geometry;
    if (layer !== 'multipolygons' || !g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const t = tagsOf(feature.properties);
    const kind = kindOf(t, layer);
    const name = t['name:sq'] ?? t.name;
    if (!kind || !isProtected(kind) || !name) continue;
    const outers = ((g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][]).map((rings) => rings[0]);
    const paths = outers.filter((ring) => areaKm2(ring) > 0.05).map((ring) => round(simplifyRing(ring, 0.001))).filter((ring) => ring.length >= 4)
      .map((ring) => ring.map(([lon, lat]): [number, number] => [lat, lon]));
    if (!paths.length) continue;
    const id = feature.properties.osm_id ?? feature.properties.osm_way_id;
    if (id) byId.set(`${feature.properties.osm_id ? 'relation' : 'way'}/${id}`, paths);
    const area = outers.reduce((sum, ring) => sum + areaKm2(ring), 0);
    const key = normalize(name);
    if (area > (byName.get(key)?.area ?? 0)) byName.set(key, { paths, area });
  }
  return { byId, byName: new Map([...byName].map(([key, value]) => [key, value.paths])) };
}
