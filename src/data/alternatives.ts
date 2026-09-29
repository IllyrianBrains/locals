/**
 * "Beyond the hotspots": for a busier guide city, the quieter guide cities that offer a similar mix of the five
 * pillars (places.ts) within reach. Computed from municipalities.json, so a new city needs no editing here.
 */
import { cities, type City } from './cities';
import { pillarLabels, type Pillar } from './places';
import municipalities from './municipalities.json';

const pillars = Object.keys(pillarLabels) as Pillar[];
const maxKm = 150;

interface Muni { slug: string; population: number; pillars: Record<Pillar, number>; level: number }
const byslug = new Map<string, Muni>(
  municipalities.features.filter((f) => f.properties.guide).map((f) => [f.properties.slug, f.properties as unknown as Muni]),
);

const km = (a: City, b: City) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.osm.lat - a.osm.lat) * rad) / 2) ** 2 + Math.cos(a.osm.lat * rad) * Math.cos(b.osm.lat * rad) * Math.sin(((b.osm.lon - a.osm.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// Square roots, as in the level itself: the mix matters more than the raw number.
const vec = (m: Muni) => pillars.map((p) => Math.sqrt(m.pillars[p] ?? 0));
const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  return dot / (Math.hypot(...a) * Math.hypot(...b) || 1);
};

export interface Alternative { city: City; km: number; shared: Pillar[]; population: number }

/** Up to `limit` smaller guide cities within reach, ranked by similarity of their pillar mix (near ones first on ties). */
export function alternativesTo(slug: string, limit = 2): Alternative[] {
  const home = cities.find((c) => c.slug === slug);
  const base = byslug.get(slug);
  if (!home || !base) return [];
  const homeVec = vec(base);
  return cities
    .filter((c) => c.slug !== slug && c.available && byslug.has(c.slug))
    .map((city) => ({ city, m: byslug.get(city.slug)!, km: km(home, city) }))
    .filter(({ m, km: d }) => m.population < base.population && d <= maxKm)
    .map((x) => ({ ...x, sim: cosine(homeVec, vec(x.m)) - x.km / 1000 }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit)
    .map(({ city, m, km: d }) => ({
      city, km: Math.round(d), population: m.population,
      // The two pillars where the alternative is strongest relative to the home city.
      shared: [...pillars].filter((p) => (m.pillars[p] ?? 0) > 0).sort((a, b) => (m.pillars[b] ?? 0) - (m.pillars[a] ?? 0)).slice(0, 2),
    }));
}
