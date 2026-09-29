/**
 * The city catalogue on the home page: every guide city with the facets visitors filter by. Trip types, seasons and
 * durations are editorial (hand-curated below); "what it offers" is computed from municipalities.json, so the two
 * never contradict the counts shown on the guide pages.
 */
import { cities, type City } from './cities';
import { categoryLabels, getCityPlaces, pillarLabels, type OsmCategory, type Pillar } from './places';
import municipalities from './municipalities.json';
import municipalityNature from './municipalityNature.json';
import { getCityLocal, localKinds, type LocalKind } from './local';
import { getFacts } from './cityFacts';
import { routesNear } from './routeData';
import { routeRadiusM } from './routes';

export type TripId = 'nature' | 'history' | 'coast' | 'weekend';
export type Season = 'pranvere' | 'vere' | 'vjeshte' | 'dimer';
export type Stay = 'short' | 'mid' | 'long';

export const seasonLabels: Record<Season, string> = { pranvere: 'Pranverë', vere: 'Verë', vjeshte: 'Vjeshtë', dimer: 'Dimër' };
export const stayLabels: Record<Stay, string> = { short: '2–3 ditë', mid: '3–5 ditë', long: '4–7 ditë' };

/** Trip types: a traveller intent, when it works best, how long it takes, and its hand-picked cities. */
export const tripTypes: Record<TripId, { icon: string; title: string; text: string; seasons: Season[]; stay: Stay; featured: string[] }> = {
  nature: { icon: '↟', title: 'Natyrë pa nxitim', text: 'Shtigje, lumenj dhe bujtina pranë maleve.', seasons: ['pranvere', 'vere', 'vjeshte'], stay: 'mid', featured: ['permet', 'peje', 'malesi-e-madhe', 'bajram-curri', 'kolonje', 'decan', 'kukes', 'peshkopi'] },
  history: { icon: '◇', title: 'Qytete me histori', text: 'Lagje të vjetra, kala dhe mjeshtëri vendase.', seasons: ['pranvere', 'vjeshte', 'dimer'], stay: 'mid', featured: ['berat', 'prizren', 'gjirokaster', 'gjakove', 'kruje', 'korce', 'shkoder', 'elbasan'] },
  coast: { icon: '≈', title: 'Bregdet i qetë', text: 'Gjire, fshatra dhe ushqim deti jashtë sezonit.', seasons: ['pranvere', 'vere', 'vjeshte'], stay: 'long', featured: ['himare', 'vlore', 'saranda', 'delvine', 'lezhe', 'durres', 'pogradec'] },
  weekend: { icon: '○', title: 'Fundjavë lokale', text: 'Tregje, kafene dhe kulturë që arrihen lehtë.', seasons: ['pranvere', 'vere', 'vjeshte', 'dimer'], stay: 'short', featured: ['tirane', 'prishtine', 'shkoder', 'mitrovice', 'gjilan', 'ferizaj', 'korce'] },
};

const pillars = Object.keys(pillarLabels) as Pillar[];
const categories = Object.keys(categoryLabels) as OsmCategory[];
const props = new Map(municipalities.features.filter((f) => f.properties.guide).map((f) => [f.properties.slug, f.properties]));

/** A pillar counts as a strength when the city is in the top third of the guide cities for it (and has any): the filter compares like with like. */
const strengthCutoff = Object.fromEntries(pillars.map((p) => {
  const values = [...props.values()].map((f) => (f.pillars as Record<Pillar, number>)[p] ?? 0).sort((a, b) => a - b);
  return [p, Math.max(1, values[Math.ceil(values.length * (2 / 3))] ?? 1)];
})) as Record<Pillar, number>;

/**
 * Everything the "Rendit sipas" menu can sort by, beyond the name: a count for each kind of thing in the data.
 * `unit` is what the card shows next to the number.
 */
export interface SortMetric { key: string; label: string; unit: string }
export const sortGroups: { label: string; metrics: SortMetric[] }[] = [
  { label: 'Natyra në bashki', metrics: [
    { key: 'nat:peak', label: 'Majave', unit: 'maja' },
    { key: 'nat:waterfall', label: 'Ujëvarave', unit: 'ujëvara' },
    { key: 'nat:spring', label: 'Burimeve', unit: 'burime' },
    { key: 'nat:cave_entrance', label: 'Shpellave', unit: 'shpella' },
    { key: 'nat:protected', label: 'Zonave të mbrojtura', unit: 'zona të mbrojtura' },
    { key: 'water', label: 'Liqeneve dhe lumenjve', unit: 'ujëra pranë qendrës' },
  ] },
  { label: 'Bujtina & kuzhinë', metrics: [
    { key: 'local:stay', label: 'Bujtinave', unit: 'bujtina' },
    { key: 'local:food', label: 'Kuzhinës tradicionale', unit: 'vende ushqimi' },
    { key: 'local:craft', label: 'Prodhuesve e zejtarëve', unit: 'prodhues e zejtarë' },
  ] },
  { label: 'Shifra', metrics: [
    { key: 'routes', label: 'Shtigjeve të shënuara', unit: 'shtigje' },
    { key: 'places', label: 'Vendeve për të parë', unit: 'vende për të parë' },
    { key: 'population', label: 'Banorëve', unit: 'banorë' },
    { key: 'area', label: 'Sipërfaqes', unit: 'km²' },
    { key: 'elevation', label: 'Lartësisë mbi det', unit: 'm mbi det' },
  ] },
];

export interface CatalogueCity {
  city: City;
  trips: TripId[];
  seasons: Season[];
  stays: Stay[];
  strengths: Pillar[];
  stats: { score: number; count: number; level: number; pillars: Record<Pillar, number>; features: Record<OsmCategory, number>; metrics: Record<string, number> };
}

/** Where a city is not hand-picked, the trip type follows its strongest pillar: nature and trails, heritage, or local life. */
function inferTrip(strengths: Pillar[]): TripId {
  if (strengths.includes('nature') || strengths.includes('trails')) return 'nature';
  if (strengths.includes('heritage')) return 'history';
  return 'weekend';
}

export const catalogue: CatalogueCity[] = cities.map((city) => {
  const municipality = props.get(city.slug);
  const counts = (municipality?.pillars ?? {}) as Record<Pillar, number>;
  const strengths = pillars.filter((p) => (counts[p] ?? 0) >= strengthCutoff[p]);
  const places = getCityPlaces(city.slug)?.places ?? [];
  const features = Object.fromEntries(categories.map((category) => [category, places.filter((place) => place.category === category).length])) as Record<OsmCategory, number>;
  const cityData = getCityPlaces(city.slug);
  const wide = (municipalityNature.cities as Record<string, { kind: string }[]>)[city.slug] ?? [];
  const local = getCityLocal(city.slug)?.places ?? [];
  const facts = getFacts(city.slug);
  const metrics: Record<string, number> = {
    'nat:peak': wide.filter((n) => n.kind === 'peak').length,
    'nat:waterfall': wide.filter((n) => n.kind === 'waterfall').length,
    'nat:spring': wide.filter((n) => n.kind === 'spring').length,
    'nat:cave_entrance': wide.filter((n) => n.kind === 'cave_entrance').length,
    'nat:protected': wide.filter((n) => /^(national_park|protected_area|nature_reserve)$/.test(n.kind)).length,
    water: (cityData?.nature ?? []).filter((n) => /^(lake|reservoir|wetland|bay|river)$/.test(n.kind)).length,
    ...Object.fromEntries((Object.keys(localKinds) as LocalKind[]).map((k) => [`local:${k}`, local.filter((p) => p.kind === k).length])),
    routes: routesNear(city.osm.lat, city.osm.lon, routeRadiusM).length,
    places: places.length,
    population: facts?.population?.value ?? 0,
    area: facts?.areaKm2 ?? 0,
    elevation: facts?.elevationM ?? 0,
  };
  const picked = (Object.keys(tripTypes) as TripId[]).filter((id) => tripTypes[id].featured.includes(city.slug));
  const trips = picked.length ? picked : [inferTrip(strengths)];
  return {
    city, trips, strengths,
    stats: { score: municipality?.score ?? 0, count: municipality?.count ?? 0, level: municipality?.level ?? 0, pillars: Object.fromEntries(pillars.map((p) => [p, counts[p] ?? 0])) as Record<Pillar, number>, features, metrics },
    seasons: [...new Set(trips.flatMap((id) => tripTypes[id].seasons))],
    stays: [...new Set(trips.map((id) => tripTypes[id].stay))],
  };
}).sort((a, b) => a.city.name.localeCompare(b.city.name, 'sq'));
