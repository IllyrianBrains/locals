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
 * How much a municipality offers for sustainable tourism, from little mapped (1) to very rich (5), named like
 * musical dynamics. Each level is computed by scripts/fetch-boundaries.ts into municipalities.json.
 */
export const sightLevels = [
  { mark: 'pp', label: 'Pak e hartuar' },
  { mark: 'p', label: 'Fillestare' },
  { mark: 'mf', label: 'Mjaftueshëm' },
  { mark: 'f', label: 'E pasur' },
  { mark: 'ff', label: 'Shumë e pasur' },
] as const;

/** The five things counted for the level: protected nature, trails, heritage, local businesses, car-free access. */
export type Pillar = 'nature' | 'trails' | 'heritage' | 'local' | 'access';
export const pillarLabels: Record<Pillar, string> = {
  nature: 'Natyrë',
  trails: 'Shtigje',
  heritage: 'Trashëgimi',
  local: 'Prodhues vendas',
  access: 'Pa makinë',
};

/** One line on what each pillar counts, for the city guides. */
export const pillarHints: Record<Pillar, string> = {
  nature: 'Zona të mbrojtura, maja, burime, shpella dhe ujëvara.',
  trails: 'Shtigje ecjeje e biçiklete, kasolle malore dhe kampe.',
  heritage: 'Kala, vende arkeologjike, manastire dhe muze.',
  local: 'Guesthouse-e, zanate, tregje dhe prodhues vendas.',
  access: 'Stacione treni e autobusi dhe biçikleta me qira.',
};

