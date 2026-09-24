/**
 * Adds Wikidata taglines, Wikipedia summaries and credited Wikimedia Commons images to OSM places.
 * API responses are cached in .cache/osm/wiki.json so re-runs only fetch what is new,
 * and --offline runs use the cache alone.
 *
 * Wikipedia text and Commons images are CC BY-SA (or similar): keep the source link and credit next to them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import type { OsmPlace } from '../src/data/places.ts';

const USER_AGENT = 'ib-locals/0.1 (https://locals.illyrianbrains.org; illyrianbrains@gmail.com)';
const CACHE_FILE = new URL('../.cache/osm/wiki.json', import.meta.url);
const LANGS = ['sq', 'en'] as const;
type Lang = (typeof LANGS)[number];

interface WikidataInfo { description?: Partial<Record<Lang, string>>; image?: string; sitelinks?: Partial<Record<Lang, string>> }
interface CommonsInfo { url: string; credit: string }
interface WikipediaInfo { title: string; extract: string }

interface Cache {
  wikidata: Record<string, WikidataInfo | null>;
  commons: Record<string, CommonsInfo | null>;
  wikipedia: Record<string, WikipediaInfo | null>; // key: "<lang>:<title>"
}

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

async function api(base: string, params: Record<string, string>): Promise<any> {
  const url = `${base}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${base} → HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw new Error(`${base} → gave up after retries`);
}

/** Follows the normalized/redirects arrays of a MediaWiki query so results map back to the titles we asked for. */
function resolveTitles(query: any, titles: string[]): Map<string, string> {
  const steps = new Map<string, string>();
  for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) steps.set(from, to);
  return new Map(titles.map((t) => {
    let final = t;
    for (let i = 0; i < 5 && steps.has(final); i++) final = steps.get(final)!;
    return [t, final];
  }));
}

async function fetchWikidata(ids: string[], cache: Cache): Promise<void> {
  for (const batch of chunk(ids, 50)) {
    const data = await api('https://www.wikidata.org/w/api.php', {
      action: 'wbgetentities', ids: batch.join('|'), props: 'descriptions|claims|sitelinks', languages: LANGS.join('|'),
    });
    for (const id of batch) {
      const e = data.entities?.[id];
      if (!e || e.missing !== undefined) { cache.wikidata[id] = null; continue; }
      const info: WikidataInfo = { description: {}, sitelinks: {} };
      for (const lang of LANGS) {
        if (e.descriptions?.[lang]) info.description![lang] = e.descriptions[lang].value;
        if (e.sitelinks?.[`${lang}wiki`]) info.sitelinks![lang] = e.sitelinks[`${lang}wiki`].title;
      }
      info.image = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      cache.wikidata[id] = info;
    }
  }
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

async function fetchCommons(files: string[], cache: Cache): Promise<void> {
  for (const batch of chunk(files, 50)) {
    const titles = batch.map((f) => `File:${f}`);
    const { query } = await api('https://commons.wikimedia.org/w/api.php', {
      action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1000',
      iiextmetadatafilter: 'Artist|LicenseShortName',
    });
    const resolved = resolveTitles(query, titles);
    for (const [i, file] of batch.entries()) {
      const page = query.pages?.find((p: any) => p.title === resolved.get(titles[i]));
      const info = page?.imageinfo?.[0];
      if (!info) { cache.commons[file] = null; continue; }
      const artist = stripHtml(info.extmetadata?.Artist?.value ?? '');
      const license = info.extmetadata?.LicenseShortName?.value ?? '';
      cache.commons[file] = {
        url: info.thumburl ?? info.url,
        credit: [artist.length > 60 ? `${artist.slice(0, 57)}…` : artist, license].filter(Boolean).join(' · ') || 'Wikimedia Commons',
      };
    }
  }
}

async function fetchWikipedia(keys: string[], cache: Cache): Promise<void> {
  for (const lang of LANGS) {
    const titles = keys.filter((k) => k.startsWith(`${lang}:`)).map((k) => k.slice(lang.length + 1));
    for (const batch of chunk(titles, 20)) { // exintro allows at most 20 titles per request
      const { query } = await api(`https://${lang}.wikipedia.org/w/api.php`, {
        action: 'query', titles: batch.join('|'), prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '2', exlimit: '20', redirects: '1',
      });
      const resolved = resolveTitles(query, batch);
      for (const title of batch) {
        const page = query.pages?.find((p: any) => p.title === resolved.get(title));
        cache.wikipedia[`${lang}:${title}`] = page?.extract ? { title: page.title, extract: page.extract } : null;
      }
    }
  }
}

/** Cleanup applied on output (not in the cache), so it can be tuned and re-run with --offline. */
const cleanExtract = (text: string) => text
  .replace(/\s*\([^()]*\)/, '') // drop the pronunciation/date parenthesis
  .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[^\p{L}\d"“„]+/u, '').trim();

/** "sq:Kalaja e Beratit" → ['sq', 'Kalaja e Beratit'] */
function parseWikipediaTag(tag?: string): [Lang, string] | undefined {
  const match = tag?.match(/^([a-z]{2,3}):(.+)$/);
  return match && (LANGS as readonly string[]).includes(match[1]) ? [match[1] as Lang, match[2]] : undefined;
}

function wikipediaCandidates(place: OsmPlace, cache: Cache): [Lang, string][] {
  const wd = place.wikidata ? cache.wikidata[place.wikidata] : undefined;
  const fromTag = parseWikipediaTag(place.wikipedia);
  return LANGS.map((lang): [Lang, string] | undefined => {
    const title = wd?.sitelinks?.[lang] ?? (fromTag?.[0] === lang ? fromTag[1] : undefined);
    return title ? [lang, title] : undefined;
  }).filter((c) => c !== undefined);
}

async function loadCache(): Promise<Cache> {
  try { return JSON.parse(await readFile(CACHE_FILE, 'utf8')); } catch { return { wikidata: {}, commons: {}, wikipedia: {} }; }
}

export async function enrichPlaces(places: OsmPlace[], offline: boolean): Promise<void> {
  const cache = await loadCache();

  if (!offline) {
    const missingIds = [...new Set(places.map((p) => p.wikidata).filter((id): id is string => !!id && /^Q\d+$/.test(id) && !(id in cache.wikidata)))];
    await fetchWikidata(missingIds, cache);

    const files = places.map((p) => p.imageFile ?? (p.wikidata ? cache.wikidata[p.wikidata]?.image : undefined));
    await fetchCommons([...new Set(files.filter((f): f is string => !!f && !(f in cache.commons)))], cache);

    const keys = places.flatMap((p) => wikipediaCandidates(p, cache).map(([lang, title]) => `${lang}:${title}`));
    await fetchWikipedia([...new Set(keys.filter((k) => !(k in cache.wikipedia)))], cache);

    await writeFile(CACHE_FILE, JSON.stringify(cache));
  }

  for (const place of places) {
    const wd = place.wikidata ? cache.wikidata[place.wikidata] : undefined;

    const imageFile = place.imageFile ?? wd?.image;
    const image = imageFile ? cache.commons[imageFile] : undefined;
    if (image) Object.assign(place, { imageFile, image: image.url, imageCredit: image.credit });

    const tagline = wd?.description?.sq ?? wd?.description?.en;
    if (tagline) place.tagline = { text: tagline, lang: wd?.description?.sq ? 'sq' : 'en' };

    for (const [lang, title] of wikipediaCandidates(place, cache)) {
      const article = cache.wikipedia[`${lang}:${title}`];
      const text = article && cleanExtract(article.extract);
      if (!text) continue;
      place.summary = {
        text,
        lang,
        source: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article!.title.replaceAll(' ', '_'))}`,
      };
      break; // LANGS order: Albanian first
    }
  }
}
