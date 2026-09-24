/**
 * Places extracted from OpenStreetMap by scripts/fetch-osm.ts (data © OpenStreetMap contributors, ODbL),
 * enriched with Wikidata taglines, Wikipedia summaries (CC BY-SA) and Wikimedia Commons images.
 */

export type OsmCategory = 'museum' | 'history' | 'religion' | 'culture' | 'art' | 'nature' | 'viewpoint' | 'market' | 'attraction';

export const categoryLabels: Record<OsmCategory, string> = {
  museum: 'Muze & galeri',
  history: 'Histori',
  religion: 'Besim',
  culture: 'Kulturë',
  art: 'Art publik',
  nature: 'Natyrë & parqe',
  viewpoint: 'Pamje',
  market: 'Tregje',
  attraction: 'Atraksione',
};

export interface OsmPlace {
  id: string;
  name: string;
  nameEn?: string;
  category: OsmCategory;
  kind?: string;
  lat: number;
  lon: number;
  /** Free-text description from the OSM tags. */
  description?: string;
  /** Short Wikidata description, e.g. "muze në Tiranë". */
  tagline?: { text: string; lang: string };
  /** First sentences of the Wikipedia article (Albanian preferred). Link `source` when shown. */
  summary?: { text: string; lang: string; source: string };
  wikidata?: string;
  wikipedia?: string;
  /** Wikimedia Commons file name. */
  imageFile?: string;
  /** Thumbnail URL (1000px); show `imageCredit` with it. */
  image?: string;
  imageCredit?: string;
  website?: string;
  openingHours?: string;
  fee?: string;
  wheelchair?: string;
  heritage?: string;
  osmUrl: string;
  score: number;
}

export interface OsmCityData {
  city: string;
  name: string;
  center: { lat: number; lon: number };
  radius: number;
  fetchedAt: string;
  attribution: string;
  license: string;
  count: number;
  places: OsmPlace[];
}

const files = import.meta.glob<OsmCityData>('./osm/*.json', { eager: true, import: 'default' });

export function getCityPlaces(slug: string): OsmCityData | undefined {
  return files[`./osm/${slug}.json`];
}

/** Top places for a city, optionally limited to one category. */
export function topPlaces(slug: string, limit = 12, category?: OsmCategory): OsmPlace[] {
  const places = getCityPlaces(slug)?.places ?? [];
  return (category ? places.filter((p) => p.category === category) : places).slice(0, limit);
}

/**
 * How much there is to see and do, from quiet (1) to packed (5), named like musical dynamics.
 * Each municipality's level is computed by scripts/fetch-boundaries.ts into municipalities.json.
 */
export const sightLevels = [
  { mark: 'pp', label: 'Qetësi' },
  { mark: 'p', label: 'Pak për të parë' },
  { mark: 'mf', label: 'Mjaftueshëm' },
  { mark: 'f', label: 'Shumë për të parë' },
  { mark: 'ff', label: 'Plot' },
] as const;

