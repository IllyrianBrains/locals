/**
 * Adds Wikidata facts to every city in src/data/cities.ts and writes src/data/cityFacts.json:
 * a short description, the first sentences of the Wikipedia article (Albanian first, then English), population,
 * area, elevation and official website.
 *
 *   npm run cities
 *
 * The town's Wikidata item (`wikidata.town`) supplies the description, article and elevation; the municipality's
 * (`wikidata.municipality`) supplies the population, falling back to OpenStreetMap's `population` tag. Wikidata's area
 * statements mix towns and municipalities and are sometimes wrong, so the area is measured from the municipality outline
 * in src/data/municipalities.json instead. Wikidata is CC0; Wikipedia text is CC BY-SA, so link `summary.source`
 * wherever it is shown.
 */
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { cities } from '../src/data/cities.ts';
import { api, cleanExtract } from './enrich-wiki.ts';

const OUT_FILE = new URL('../src/data/cityFacts.json', import.meta.url);
const METRE = 'Q11573';

interface Claim { rank: string; mainsnak: { datavalue?: { value: any } }; qualifiers?: Record<string, { datavalue?: { value: any } }[]> }
interface Entity { descriptions?: Record<string, { value: string }>; claims?: Record<string, Claim[]>; sitelinks?: Record<string, { title: string }> }

const yearOf = (claim: Claim) => Number(claim.qualifiers?.P585?.[0]?.datavalue?.value?.time?.match(/^\+?(\d{4})/)?.[1] ?? 0);

/** The preferred statement, else the most recent one; deprecated statements are ignored. */
function best(entity: Entity | undefined, property: string, accept: (claim: Claim) => boolean = () => true): Claim | undefined {
  const usable = (entity?.claims?.[property] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak.datavalue && accept(c));
  const preferred = usable.filter((c) => c.rank === 'preferred');
  return (preferred.length ? preferred : usable).sort((a, b) => yearOf(b) - yearOf(a))[0];
}

const amount = (claim?: Claim) => (claim ? Number(claim.mainsnak.datavalue!.value.amount) : undefined);
const unitIs = (unit: string) => (c: Claim) => String(c.mainsnak.datavalue!.value.unit).endsWith(unit);

type Ring = [number, number][];
/** Area of a polygon (outer ring first, then holes) in km², on a local flat projection: plenty for a municipality. */
function polygonKm2(rings: Ring[]): number {
  const lat0 = (rings[0].reduce((sum, [, lat]) => sum + lat, 0) / rings[0].length) * (Math.PI / 180);
  const ring = (r: Ring) => Math.abs(r.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = r[(i + 1) % r.length];
    return sum + (x1 * 111.32 * Math.cos(lat0)) * (y2 * 110.57) - (x2 * 111.32 * Math.cos(lat0)) * (y1 * 110.57);
  }, 0) / 2);
  return ring(rings[0]) - rings.slice(1).reduce((sum, hole) => sum + ring(hole), 0);
}

const outlines = new Map<number, { area: number; population?: number }>();
for (const f of JSON.parse(await readFile(new URL('../src/data/municipalities.json', import.meta.url), 'utf8')).features) {
  const polygons: Ring[][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  outlines.set(f.properties.id, { area: polygons.reduce((sum, rings) => sum + polygonKm2(rings), 0), population: f.properties.population });
}

async function entities(ids: string[]): Promise<Record<string, Entity>> {
  const { entities } = await api('https://www.wikidata.org/w/api.php', {
    action: 'wbgetentities', ids: [...new Set(ids)].join('|'), props: 'descriptions|claims|sitelinks', languages: 'sq|en',
  });
  return entities;
}

async function wikipedia(lang: 'sq' | 'en', title: string): Promise<{ text: string; source: string } | undefined> {
  const { query } = await api(`https://${lang}.wikipedia.org/w/api.php`, {
    action: 'query', titles: title, prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '3', redirects: '1',
  });
  const page = query.pages?.[0];
  const text = page?.extract && cleanExtract(page.extract);
  return text ? { text, source: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}` } : undefined;
}

const data = await entities(cities.flatMap((c) => [c.wikidata.town, c.wikidata.municipality]));
const facts: Record<string, unknown> = {};

for (const city of cities) {
  const town = data[city.wikidata.town], municipality = data[city.wikidata.municipality];
  const outline = outlines.get(city.osm.boundary);
  const population = best(municipality, 'P1082');
  const populationValue = amount(population) ?? outline?.population;
  const elevation = best(town, 'P2044', unitIs(METRE));
  const website = (best(municipality, 'P856') ?? best(town, 'P856'))?.mainsnak.datavalue!.value as string | undefined;

  let summary: { text: string; lang: string; source: string } | undefined;
  for (const lang of ['sq', 'en'] as const) {
    const title = town?.sitelinks?.[`${lang}wiki`]?.title;
    const found = title ? await wikipedia(lang, title) : undefined;
    if (found) { summary = { ...found, lang }; break; }
  }
  const description = town?.descriptions?.sq?.value ?? town?.descriptions?.en?.value;

  facts[city.slug] = {
    wikidata: city.wikidata,
    ...(description && { description: { text: description, lang: town.descriptions?.sq ? 'sq' : 'en' } }),
    ...(summary && { summary }),
    ...(populationValue && { population: { value: populationValue, year: (population && yearOf(population)) || undefined } }),
    ...(outline && { areaKm2: Math.round(outline.area) }),
    // Coastal towns are recorded at 0 m: not worth showing.
    ...(elevation && amount(elevation)! >= 5 && { elevationM: Math.round(amount(elevation)!) }),
    ...(website && { website }),
  };
  console.log(`✓ ${city.name}: ${populationValue?.toLocaleString('en') ?? '–'} people, ${outline ? Math.round(outline.area) + ' km²' : '–'}, ${elevation ? amount(elevation) + ' m' : '–'}, ${summary ? summary.lang : 'no'} summary`);
  await new Promise((r) => setTimeout(r, 300));
}

await writeFile(OUT_FILE, JSON.stringify({ source: 'Wikidata (CC0), Wikipedia (CC BY-SA)', fetchedAt: new Date().toISOString(), cities: facts }, null, 2) + '\n');
