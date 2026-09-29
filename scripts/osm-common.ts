/**
 * OpenStreetMap helpers shared by fetch-osm.ts (places per city) and fetch-boundaries.ts (municipality levels):
 * the Overpass client, the place filters, and how features are categorised, scored and deduplicated.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import type { OsmCategory, OsmPlace, Pillar } from '../src/data/places.ts';
import type { LocalKind, LocalPlace } from '../src/data/local.ts';

export const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const USER_AGENT = 'ib-locals/0.1 (https://locals.illyrianbrains.org)';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Every kind of place worth visiting: the tag rules `toPlace` starts from. Nameless features are never places. */
export function isPlace(t: Record<string, string>): boolean {
  if (!t.name) return false;
  return /^(attraction|museum|gallery|viewpoint|artwork|zoo|theme_park)$/.test(t.tourism ?? '')
    || (!!t.historic && !/^(yes|boundary_stone|milestone|district)$/.test(t.historic))
    || /^(park|garden|nature_reserve)$/.test(t.leisure ?? '')
    || /^(theatre|arts_centre|marketplace|planetarium)$/.test(t.amenity ?? '')
    || (t.amenity === 'place_of_worship' && !!t.wikidata)
    || /^(peak|cave_entrance|spring|beach)$/.test(t.natural ?? '')
    || (/^(tower|lighthouse)$/.test(t.man_made ?? '') && !!t.tourism);
}

/**
 * Sustainable-tourism features, used for the region map. Unlike `isPlace` this leaves out what mostly draws
 * crowds (theme parks, zoos, statues and plaques, generic attractions, beaches) and looks for what supports
 * low-impact travel: protected nature, trails, heritage, local businesses and ways to arrive without a car.
 * Routes and protected areas are matched by their centre point.
 */
export const pillars: Pillar[] = ['nature', 'trails', 'heritage', 'local', 'access'];

export function pillarOf(t: Record<string, string>, type?: OverpassElement['type']): Pillar | null {
  const named = !!t.name;
  if (named && (/^(national_park|protected_area)$/.test(t.boundary ?? '') || t.leisure === 'nature_reserve' || t.waterway === 'waterfall' || /^(peak|spring|cave_entrance)$/.test(t.natural ?? ''))) return 'nature';
  // Routes are OSM relations made from many ways. Count the relation once, never every member segment.
  if (/^(hiking|foot|bicycle|mtb)$/.test(t.route ?? '')) return type && type !== 'relation' ? null : 'trails';
  if (/^(alpine_hut|wilderness_hut|camp_site)$/.test(t.tourism ?? '')) return 'trails';
  if (named && (/^(castle|fort|archaeological_site|monastery|ruins|city_gate|manor|tomb)$/.test(t.historic ?? '') || t.heritage || t.tourism === 'museum' || (t.amenity === 'place_of_worship' && t.wikidata))) return 'heritage';
  if (/^(guest_house|farm_stay|chalet|wine_cellar)$/.test(t.tourism ?? '') || t.craft || /^(farm|craft)$/.test(t.shop ?? '') || (named && t.amenity === 'marketplace')) return 'local';
  if ((named && /^(station|halt)$/.test(t.railway ?? '')) || /^(bus_station|bicycle_rental)$/.test(t.amenity ?? '')) return 'access';
  return null;
}

export async function fetchOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (res.ok) return await res.json();
        lastError = new Error(`${endpoint} → HTTP ${res.status}`);
        if (res.status !== 429 && res.status < 500) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
  throw lastError;
}

export function categorize(t: Record<string, string>): OsmCategory | null {
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museum';
  if (t.tourism === 'viewpoint' || t.natural === 'peak' || t.man_made === 'tower' || t.man_made === 'lighthouse') return 'viewpoint';
  if (t.tourism === 'artwork') return 'art';
  if (t.amenity === 'place_of_worship' || t.landuse === 'religious') return 'religion';
  if (t.amenity === 'theatre' || t.amenity === 'arts_centre' || t.amenity === 'planetarium') return 'culture';
  if (t.amenity === 'marketplace') return 'market';
  if (t.leisure || t.natural || t.tourism === 'zoo') return 'nature';
  if (t.historic) return 'history';
  if (t.tourism === 'attraction' || t.tourism === 'theme_park') return 'attraction';
  return null;
}

/** Rough notability score: well-documented features are usually the ones worth visiting. */
export function score(t: Record<string, string>, category: OsmCategory): number {
  let s = 0;
  if (t.wikidata) s += 4;
  if (t.wikipedia) s += 3;
  if (t.image || t.wikimedia_commons) s += 2;
  if (t['name:en']) s += 1;
  if (t.website || t['contact:website']) s += 1;
  if (t.opening_hours) s += 1;
  if (t.description) s += 1;
  if (t.heritage) s += 2;
  if (t.tourism === 'attraction' || t.tourism === 'museum') s += 2;
  if (['castle', 'archaeological_site', 'ruins', 'fort', 'viewpoint', 'peak', 'beach'].includes(t.historic ?? t.tourism ?? t.natural ?? '')) s += 1;
  if (category === 'art' && !t.wikidata) s -= 1; // many small plaques/busts
  if (t.historic === 'memorial' && !t.wikidata) s -= 1;
  return s;
}

/** Only Wikimedia Commons images are kept: their licence and author can be looked up and credited. */
export function commonsFile(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^File:(.+)$/) ??
    value.match(/commons\.wikimedia\.org\/wiki\/File:([^?#]+)/) ??
    value.match(/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]).replaceAll('_', ' '); } catch { return match[1].replaceAll('_', ' '); }
}

export function toPlace(el: OverpassElement): OsmPlace | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const category = categorize(t);
  if (!t.name || lat === undefined || lon === undefined || !category) return null;
  const place: OsmPlace = {
    id: `${el.type}/${el.id}`,
    name: t['name:sq'] ?? t.name,
    nameEn: t['name:en'],
    category,
    kind: t.tourism ?? t.historic ?? t.amenity ?? t.leisure ?? t.natural ?? t.man_made,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    description: t['description:sq'] ?? t.description ?? t['description:en'],
    wikidata: t.wikidata,
    wikipedia: t.wikipedia,
    imageFile: commonsFile(t.image) ?? commonsFile(t.wikimedia_commons),
    website: t.website ?? t['contact:website'],
    openingHours: t.opening_hours,
    fee: t.fee,
    wheelchair: t.wheelchair,
    heritage: t.heritage,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    score: score(t, category),
  };
  for (const key of Object.keys(place) as (keyof OsmPlace)[]) if (place[key] === undefined) delete place[key];
  return place;
}

export function distanceMeters(a: OsmPlace, b: OsmPlace): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export const normalize = (s: string) => s.toLocaleLowerCase('sq').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** The same feature is often mapped twice (e.g. a museum node inside its building way): keep the richer one. */
export function dedupe(places: OsmPlace[]): OsmPlace[] {
  const kept: OsmPlace[] = [];
  for (const place of [...places].sort((a, b) => b.score - a.score)) {
    const duplicate = kept.some((k) =>
      (place.wikidata && k.wikidata === place.wikidata) ||
      (normalize(k.name) === normalize(place.name) && distanceMeters(k, place) < 300));
    if (!duplicate) kept.push(place);
  }
  return kept;
}


/**
 * Local businesses: guesthouses (bujtina), traditional food and local producers. Unlike `isPlace` these are not
 * sights but the places that let a visitor stay, eat and buy from local people.
 */
const traditionalCuisine = /(^|[;,\s])(regional|local|traditional|albanian|kosovan|kosovar|balkan|byrek|qofte|kebab_albanian)($|[;,\s])/i;
const traditionalName = /tradicion|bujtin|\bkull(a|e|es)\b|mullixh|\bhan(i)?\b|kasolle|tavern|konak|ciflig|çiflig|agroturiz|vendas|gjell/i;

/** Crafts worth a visit; the rest of `craft=*` is mostly electricians, tailors and repair shops. */
const visitableCraft = /^(winery|brewery|distillery|beekeeper|cheese|cheese_maker|pottery|ceramics|handicraft|weaver|blacksmith|basket_maker|oil_mill|jeweller|leather|carpet|embroidery|woodcarver|stonemason|honey_farm|dairy)$/;

export function localKind(t: Record<string, string>): LocalKind | null {
  if (!t.name) return null;
  if (/^(guest_house|farm_stay|chalet)$/.test(t.tourism ?? '') || (t.tourism === 'hotel' && /bujtin/i.test(t.name))) return 'stay';
  if (/^(restaurant|cafe)$/.test(t.amenity ?? '') && (traditionalCuisine.test(t.cuisine ?? '') || traditionalName.test(t.name))) return 'food';
  if (t.tourism === 'wine_cellar' || visitableCraft.test(t.craft ?? '') || /^(farm|craft|cheese|wine)$/.test(t.shop ?? '')) return 'craft';
  return null;
}

const localLabels: Record<string, string> = {
  guest_house: 'Bujtinë', farm_stay: 'Agroturizëm', chalet: 'Kasolle', hotel: 'Bujtinë',
  restaurant: 'Restorant', cafe: 'Kafene', wine_cellar: 'Kantinë vere',
  farm: 'Fermë', cheese: 'Djathë', wine: 'Verë', craft: 'Zejtari',
};
const craftLabels: Record<string, string> = {
  winery: 'Kantinë vere', brewery: 'Birrari', distillery: 'Distilerí', beekeeper: 'Bletari', cheese: 'Djathë',
  carpenter: 'Zdrukthëtari', pottery: 'Qeramikë', blacksmith: 'Farkëtari', tailor: 'Rrobaqepësi', shoemaker: 'Këpucari',
  weaver: 'Endje', handicraft: 'Artizanat', jeweller: 'Bizhuteri', ceramics: 'Qeramikë', basket_maker: 'Shporta',
  oil_mill: 'Vaj ulliri', confectionery: 'Ëmbëlsira', leather: 'Lëkurë', carpet: 'Qilima', embroidery: 'Qëndisje',
  woodcarver: 'Gdhendje druri', stonemason: 'Gur', honey_farm: 'Bletari', cheese_maker: 'Djathë', dairy: 'Bulmet',
};

export function toLocal(el: OverpassElement): LocalPlace | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const kind = localKind(t);
  if (!kind || lat === undefined || lon === undefined) return null;
  const type = kind === 'craft' ? (t.craft && craftLabels[t.craft]) || localLabels[t.tourism ?? t.shop ?? 'craft'] || 'Zejtari' : localLabels[(kind === 'food' ? t.amenity : t.tourism) ?? t.amenity ?? ''] ?? 'Vend vendas';
  const contact = { phone: t.phone ?? t['contact:phone'], email: t.email ?? t['contact:email'], website: t.website ?? t['contact:website'] ?? t['contact:facebook'] ?? t.facebook };
  const place: LocalPlace = {
    id: `${el.type}/${el.id}`,
    name: t['name:sq'] ?? t.name,
    kind,
    type,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    address: [t['addr:street'], t['addr:housenumber'], t['addr:city'] ?? t['addr:village']].filter(Boolean).join(' ') || undefined,
    description: t['description:sq'] ?? t.description ?? t['description:en'],
    cuisine: t.cuisine ? t.cuisine.split(';').map((c) => c.trim().replaceAll('_', ' ')).filter(Boolean).slice(0, 4) : undefined,
    ...contact,
    openingHours: t.opening_hours,
    wikidata: t.wikidata,
    wikipedia: t.wikipedia,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    score: 0,
  };
  place.score = (t.wikidata ? 3 : 0) + (t.wikipedia ? 2 : 0) + (t['name:en'] ? 1 : 0) + (place.website ? 2 : 0) + (place.phone ? 2 : 0)
    + (place.email ? 1 : 0) + (t.opening_hours ? 1 : 0) + (place.description ? 2 : 0) + (place.address ? 1 : 0) + (t.image || t.wikimedia_commons ? 2 : 0)
    + (kind === 'food' && traditionalCuisine.test(t.cuisine ?? '') ? 2 : 0) + (traditionalName.test(t.name) ? 1 : 0)
    + (t.tourism === 'farm_stay' || /^(winery|beekeeper|cheese)$/.test(t.craft ?? '') ? 1 : 0);
  for (const key of Object.keys(place) as (keyof LocalPlace)[]) if (place[key] === undefined) delete place[key];
  return place;
}

/** Ray casting on GeoJSON rings ([lon, lat]); holes are excluded. Shared by the boundary and local scripts. */
export type Ring = [number, number][];
export type Outline = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (point: [number, number], rings: Ring[]) => inRing(point, rings[0]) && !rings.slice(1).some((hole) => inRing(point, hole));
export const contains = (g: Outline, point: [number, number]) => g.type === 'Polygon' ? inPolygon(point, g.coordinates) : g.coordinates.some((p) => inPolygon(point, p));
