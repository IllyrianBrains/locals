/**
 * Local businesses extracted from OpenStreetMap by scripts/fetch-local.ts (data © OpenStreetMap contributors, ODbL):
 * guesthouses (bujtina), traditional restaurants and local producers and craftspeople, within each city's municipality.
 */

export type LocalKind = 'stay' | 'food' | 'craft';

export const localKinds: Record<LocalKind, { label: string; hint: string }> = {
  stay: { label: 'Bujtina & fjetje', hint: 'Bujtina, kasolle dhe agroturizëm' },
  food: { label: 'Kuzhinë tradicionale', hint: 'Restorante e kafene me shije vendase' },
  craft: { label: 'Prodhues & zejtarë', hint: 'Kantina, ferma, bletari dhe artizanat' },
};

export interface LocalPlace {
  id: string;
  name: string;
  kind: LocalKind;
  /** Albanian label of the exact type, e.g. "Bujtinë", "Restorant", "Kantinë vere". */
  type: string;
  lat: number;
  lon: number;
  /** Straight-line kilometres from the city centre. */
  km?: number;
  address?: string;
  description?: string;
  cuisine?: string[];
  website?: string;
  phone?: string;
  email?: string;
  openingHours?: string;
  wikidata?: string;
  wikipedia?: string;
  osmUrl: string;
  score: number;
}

export interface LocalCityData {
  city: string;
  name: string;
  fetchedAt: string;
  attribution: string;
  license: string;
  count: number;
  places: LocalPlace[];
}

const files = import.meta.glob<LocalCityData>('./local/*.json', { eager: true, import: 'default' });

export function getCityLocal(slug: string): LocalCityData | undefined {
  return files[`./local/${slug}.json`];
}
