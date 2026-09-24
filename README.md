# LOCALS

Local, slow-travel guides to cities in Albania and Kosovo, by [Illyrian Brains](https://illyrianbrains.org/).
Live at <https://locals.illyrianbrains.org>.

Built with [Astro](https://astro.build) as a fully static site. Site copy is in Albanian.

## Getting started

Requires Node.js 22.18 or newer (the OSM script runs TypeScript directly with Node).

```sh
npm install
npm run dev       # dev server at http://localhost:4321
npm run build     # static build into dist/
npm run preview   # serve the build locally
```

## Project structure

```
src/
  pages/           one .astro file per route (index, tirane, …)
  layouts/         BaseLayout: <head>, fonts, meta
  components/      Header, Footer, PlaceAtlas
  data/
    cities.ts      city list: copy, images, availability, OSM search area
    places.ts      types and helpers for the OSM place data
    osm/<slug>.json  places from OpenStreetMap + Wikimedia (generated, committed)
    municipalities.json  every municipality's outline and level for the region map (generated, committed)
  styles/          global.css
scripts/
  fetch-osm.ts     OpenStreetMap extractor
  enrich-wiki.ts   Wikidata / Wikipedia / Commons enrichment
  fetch-boundaries.ts  municipality outlines and levels
  osm-common.ts    Overpass client, place filters and scoring shared by both scripts
public/            static assets
```

## Places from OpenStreetMap

`scripts/fetch-osm.ts` uses the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) to pull places to visit
around each city in `src/data/cities.ts`, within the `osm.radius` of `osm.lat`/`osm.lon`.

```sh
npm run osm                    # every city
npm run osm -- tirane berat    # only some cities
npm run osm -- --offline       # reprocess cached responses in .cache/osm/ without calling any API
```

What it does:

1. **Queries** named features tagged as museums, galleries, attractions, viewpoints, artworks, historic sites,
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

The JSON is committed, so builds never call Overpass or Wikimedia. Run the script again when you want fresher data.

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
its seat town and shaded by how much there is to see. Each one gets a level from *pp* to *ff*, named like
musical dynamics (`sightLevels` in `src/data/places.ts`). Under the map, the municipalities are laid out as
piano keys, one octave per level, with the Locals guide cities marked.

`scripts/fetch-boundaries.ts` builds `src/data/municipalities.json`:

1. Lists the municipalities from Overpass, with their seat town.
2. Pulls every place worth visiting in each country, using the same filters and scoring as `fetch-osm.ts`.
3. Fetches simplified outlines from Nominatim.
4. Puts each place in its municipality and adds up the scores. Levels are by rank, so each level holds a fifth of the
   municipalities. Municipalities with nothing mapped stay at *pp*.

```sh
npm run boundaries               # fetch and build
npm run boundaries -- --offline  # rebuild from the responses cached in .cache/boundaries/
```

### Adding a city

Add an entry to `src/data/cities.ts` with its `osm` centre, radius and municipality relation id (`boundary`), then run
`npm run osm -- <slug>` and `npm run boundaries`.

### Attribution and licence

The place data is © OpenStreetMap contributors and licensed under the
[ODbL](https://opendatacommons.org/licenses/odbl/). Any page that shows it must credit
"© OpenStreetMap contributors" and link to <https://www.openstreetmap.org/copyright>.
Wikipedia summaries are CC BY-SA, so link the article (`summary.source`). Commons photos must show `imageCredit`.
`PlaceAtlas` already does all of this.

Please use the public Overpass and Wikimedia APIs politely. The script sends a User-Agent, waits between cities,
backs off on errors and caches raw responses.

## Contributing

Know a city well? Write to [illyrianbrains@gmail.com](mailto:illyrianbrains@gmail.com).

## License

Code: [AGPL-3.0](LICENSE). OpenStreetMap data: ODbL, see above.
