/**
 * When each generated dataset was last refreshed, so pages can show how current their data is. The dates are the
 * `fetchedAt` written by the scripts in scripts/, not the build date.
 */
import { getCityPlaces } from './places';
import { getCityLocal } from './local';
import facts from './cityFacts.json';
import routes from './routes.json';
import municipalities from './municipalities.json';

export interface Source { label: string; date: Date }

/** Older than this and the page says so, since places open and close and trails change. */
export const staleAfterDays = 180;

const at = (iso?: string) => (iso ? new Date(iso) : undefined);

export function citySources(slug: string): Source[] {
  const candidates: [string, string | undefined][] = [
    ['Vendet', getCityPlaces(slug)?.fetchedAt],
    ['Bujtinat dhe prodhuesit', getCityLocal(slug)?.fetchedAt],
    ['Shtigjet', routes.fetchedAt],
    ['Bashkia dhe numërimet', municipalities.fetchedAt],
    ['Faktet (Wikidata)', facts.fetchedAt],
  ];
  return candidates.flatMap(([label, iso]) => { const date = at(iso); return date && !isNaN(+date) ? [{ label, date }] : []; });
}

export const oldest = (sources: Source[]) => sources.reduce<Source | undefined>((a, s) => (!a || s.date < a.date ? s : a), undefined);
export const newest = (sources: Source[]) => sources.reduce<Source | undefined>((a, s) => (!a || s.date > a.date ? s : a), undefined);

export const daysSince = (date: Date, now = new Date()) => Math.floor((+now - +date) / 86_400_000);
export const formatDate = (date: Date) => date.toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' });

/** Latest refresh across the whole site, for the footer. */
export const siteUpdated = () => newest(citySources('tirane'));
