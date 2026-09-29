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

/** Water and protected land, listed separately from places: see scripts/nature.ts. */
export type NatureKind = 'lake' | 'reservoir' | 'wetland' | 'bay' | 'river' | 'stream' | 'canal' | 'waterfall' | 'spring' | 'hot_spring' | 'national_park' | 'protected_area' | 'nature_reserve';

export const natureLabels: Record<NatureKind, string> = {
  lake: 'Liqen', reservoir: 'Liqen artificial', wetland: 'Zonë e lagësht', bay: 'Gji', river: 'Lumë', stream: 'Përrua', canal: 'Kanal',
  waterfall: 'Ujëvarë', spring: 'Burim', hot_spring: 'Burim termal',
  national_park: 'Park kombëtar', protected_area: 'Zonë e mbrojtur', nature_reserve: 'Rezervat natyror',
};

export const isProtectedKind = (kind: NatureKind) => kind === 'national_park' || kind === 'protected_area' || kind === 'nature_reserve';

export interface NatureFeature {
  id: string;
  name: string;
  nameEn?: string;
  kind: NatureKind;
  /** The point of the feature nearest the city centre. */
  lat: number;
  lon: number;
  /** Metres from the city centre to the nearest part (0: the centre lies inside it). */
  nearM: number;
  areaKm2?: number;
  lengthKm?: number;
  /** Protection title from the OSM tags, e.g. "Natural Monument". */
  title?: string;
  wikidata?: string;
  wikipedia?: string;
  /** From Wikidata, Wikipedia and Commons when the feature has an entry: see scripts/enrich-wiki.ts. */
  tagline?: { text: string; lang: string };
  summary?: { text: string; lang: string; source: string };
  imageFile?: string;
  image?: string;
  imageCredit?: string;
  /** Simplified outlines as [lat, lon] lists: rings for areas, lines for rivers. */
  paths?: [number, number][][];
  osmUrl: string;
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
  /** Water and protected areas nearby. */
  nature?: NatureFeature[];
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

