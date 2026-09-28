# LOCALS

Local, slow-travel guides to cities in Albania and Kosovo, by [Illyrian Brains](https://illyrianbrains.org/).
Live at <https://locals.illyrianbrains.org>.

Built with [Astro](https://astro.build) as a fully static site. Site copy is in Albanian.

## Getting started

Requires Node.js 22.18 or newer (the OSM scripts run TypeScript directly with Node). Refreshing the OpenStreetMap data
also needs [GDAL](https://gdal.org) (`ogr2ogr`, e.g. `sudo apt install gdal-bin`) to read the `.osm.pbf` extracts; a plain
`npm run build` does not.

```sh
npm install
npm run dev       # dev server at http://localhost:4321
npm run build     # static build into dist/
npm run preview   # serve the build locally
```

## Project structure

```
src/
  pages/           one .astro file per route (index, tirane, …); [slug].astro is the guide template for every other city
  layouts/         BaseLayout: <head>, fonts, meta
  components/      Header, Footer, PlaceAtlas
  data/
    cities.ts      city list: copy, images, availability, OSM search area
    places.ts      types and helpers for the OSM place data
    osm/<slug>.json  places from OpenStreetMap + Wikimedia (generated, committed)
    cityFacts.ts / .json  Wikidata facts per city: population, area, elevation, description (generated, committed)
    municipalities.json  every municipality's outline and level for the region map (generated, committed)
  styles/          global.css
scripts/
  fetch-osm.ts     OpenStreetMap extractor
  enrich-wiki.ts   Wikidata / Wikipedia / Commons enrichment
  fetch-boundaries.ts  municipality outlines and levels
  enrich-cities.ts Wikidata facts for every city
  pbf.ts           reads the Geofabrik Albania / Kosovo extracts (.osm.pbf) through GDAL
  osmconf.ini      GDAL OSM driver settings for pbf.ts
  osm-common.ts    place and sustainable-tourism rules, scoring and deduplication shared by the scripts
public/            static assets
```

## Places from OpenStreetMap

`scripts/fetch-osm.ts` pulls places to visit around each city in `src/data/cities.ts`, within the `osm.radius` of
`osm.lat`/`osm.lon`. The data comes from the [Geofabrik](https://download.geofabrik.de/europe/) extracts of Albania and
Kosovo, downloaded once to `.cache/pbf/` (delete that folder to get a fresh extract). `scripts/pbf.ts` reads them with
`ogr2ogr`, so no Overpass queries are needed and a run takes seconds.

```sh
npm run osm                    # every city
npm run osm -- tirane berat    # only some cities
npm run osm -- --offline       # skip Wikimedia: use only what is already cached in .cache/osm/wiki.json
```

What it does:

1. **Reads** named features tagged as museums, galleries, attractions, viewpoints, artworks, historic sites,
   parks and gardens, theatres and arts centres, markets, notable places of worship (those with a Wikidata link),
   peaks, caves, springs and beaches.
2. **Categorises** each one as `museum`, `history`, `religion`, `culture`, `art`, `nature`, `viewpoint`, `market` or
   `attraction`. The Albanian labels are in `categoryLabels` in `src/data/places.ts`.
3. **Scores** how notable each one is, using its Wikidata/Wikipedia links, image, English name, website, opening hours,
   heritage status and type. Negative scores, mostly small busts and plaques, are dropped.
4. **Deduplicates** features mapped more than once, for example a museum node inside its building outline.
5. **Enriches** places from Wikimedia using `scripts/enrich-wiki.ts`. It adds a short Wikidata description
   (`tagline`), the first two sentences of the Wikipedia article (`summary`, Albanian first, then English) and a
   Commons photo with its author and licence (`image`, `imageCredit`). It only uses Commons images, because their
   credits can be looked up. Wikimedia responses are cached in `.cache/osm/wiki.json`, so later runs only fetch what
   is new.
6. **Writes** the top 150 per city, best first, to `src/data/osm/<slug>.json`.

The JSON is committed, so builds never call Wikimedia or read the extracts. Run the script again when you want fresher data.

The quickest way to show it is the `PlaceAtlas` component: a card grid with category filters, photo credits and
the required attribution line. It only shows Albanian text and skips English summaries.

```astro
---
import PlaceAtlas from '../components/PlaceAtlas.astro';
---
<PlaceAtlas slug="tirane" limit={24} />
```

Or use the data directly:

```astro
---
import { topPlaces, categoryLabels, getCityPlaces } from '../data/places';
const museums = topPlaces('tirane', 6, 'museum');
const { attribution } = getCityPlaces('tirane')!;
---
{museums.map(p => <a href={p.osmUrl}>{p.name} · {categoryLabels[p.category]}</a>)}
<small>{attribution}</small>
```

## Region map

The home page map (`RegionMap`) draws every municipality of Albania (61 Bashki) and Kosovo (38 Komuna), named after
its seat town and shaded by how much it offers for sustainable tourism. Each one gets a level from *pp* to *ff*, named
like musical dynamics (`sightLevels` in `src/data/places.ts`). Under the map, the municipalities are laid out as
piano keys, one octave per level, with the Locals guide cities marked.

The level counts five pillars (`pillarLabels` in `src/data/places.ts`), not general sights:

- **Natyrë**: national parks, protected areas, nature reserves, peaks, springs, caves, waterfalls
- **Shtigje**: hiking, walking and cycling routes, mountain huts, campsites
- **Trashëgimi**: castles, archaeological sites, monasteries, heritage-listed sites, museums, notable places of worship
- **Prodhues vendas**: guesthouses, farms, crafts, wine cellars, markets
- **Pa makinë**: railway and bus stations, bike rental

Theme parks, zoos, statues, generic attractions and beaches are left out on purpose. Each pillar counts by its square
root, so the mix matters more than the raw number.

`scripts/fetch-boundaries.ts` builds `src/data/municipalities.json`:

1. Lists the municipalities from Overpass, with their seat town (cached in `.cache/boundaries/`).
2. Reads the features above from each country's extract (`pillarOf` in `scripts/osm-common.ts`).
3. Fetches simplified outlines from Nominatim.
4. Puts each feature in its municipality and counts them per pillar. Levels are by rank, so each level holds a fifth of
   the municipalities. Municipalities with nothing mapped stay at *pp*.

```sh
npm run boundaries               # fetch and build
npm run boundaries -- --offline  # rebuild from the municipality lists and outlines cached in .cache/boundaries/
```

The guide markers on the map come from `src/data/cities.ts`, so a new city shows up without rebuilding the JSON.

### City facts from Wikidata

Each city in `src/data/cities.ts` carries the Wikidata items of its town and of its municipality (`wikidata`).
`npm run cities` (`scripts/enrich-cities.ts`) reads them and writes `src/data/cityFacts.json`: a short description, the
first sentences of the Wikipedia article, population, area, elevation and website. The population comes from the
municipality's item (OpenStreetMap's `population` tag fills the gaps); the area is measured from the municipality
outline, because Wikidata's area statements mix towns and municipalities; the elevation is the town's. The map popups
and the Tiranë page show population, area and elevation. Wikidata is CC0; if you show the Wikipedia summaries, link
`summary.source` (CC BY-SA).

### City guide pages

`src/pages/[slug].astro` builds a guide page for every city in `src/data/cities.ts` except Tiranë, which keeps its
hand-written page. A guide has a photo hero with the Wikidata facts, the five sustainable-tourism counts for the
municipality (`Çfarë ofron`), the city map, the place cards (`PlaceAtlas`), a short "about" text with its Wikipedia and
Wikidata links, and links to the other cities. It only uses generated data, so a new city gets a page once its
`src/data/osm/<slug>.json` and `cityFacts.json` entry exist.

### Adding a city

Add an entry to `src/data/cities.ts` with its `osm` centre, radius, municipality relation id (`boundary`) and Wikidata items
(`wikidata`), then run `npm run osm -- <slug>`, `npm run boundaries` and `npm run cities`.

### Attribution and licence

The place data is © OpenStreetMap contributors and licensed under the
[ODbL](https://opendatacommons.org/licenses/odbl/). Any page that shows it must credit
"© OpenStreetMap contributors" and link to <https://www.openstreetmap.org/copyright>.
Wikipedia summaries are CC BY-SA, so link the article (`summary.source`). Commons photos must show `imageCredit`.
`PlaceAtlas` already does all of this.

Please use the public Overpass, Nominatim, Geofabrik and Wikimedia services politely. The scripts send a User-Agent,
back off on errors and cache what they download.

## Contributing

Know a city well? Write to [illyrianbrains@gmail.com](mailto:illyrianbrains@gmail.com).

## License

Code: [AGPL-3.0](LICENSE). OpenStreetMap data: ODbL, see above.
