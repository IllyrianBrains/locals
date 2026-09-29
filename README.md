# LOCALS

Local, slow-travel guides to cities in Albania and Kosovo, by [Illyrian Brains](https://illyrianbrains.org/).
Live at <https://locals.illyrianbrains.org>.

Built with [Astro](https://astro.build) as a fully static site. Site copy is in Albanian.

## Homepage content model

The homepage is a short decision path: a filterable catalogue first, then the map, then editorial picks. Its order is intentional:

1. **Hero and city search** — the stable project promise, “Udhëto si vendas,” plus direct search.
2. **Katalogu** — every guide city in one filterable grid (`CityCatalogue`): trip type, country, season, length of stay and what it offers. Options inside a filter combine (any), filters combine with each other (all). Cities are listed A–Z.
3. **Map** — search and compare areas once a visitor wants the geographic view.
4. **Thesare të fshehta** — only three editorial recommendations at a time, so each has room to tell visitors why it matters, with the local businesses behind them.
5. **Travel principles** — concrete behavior after inspiration.

This hierarchy borrows useful patterns—not visual design or copy—from several established travel products:

- [Responsible Travel](https://www.responsibletravel.com/) leads with a clear trip-finding task and puts positive local impact close to the actual holiday choice.
- [Visit Norway](https://www.visitnorway.com/) groups inspiration into recognizable travel ideas. Its [Beyond the hotspots](https://www.visitnorway.com/places-to-go/destination-dupes/) content also pairs popular places with quieter seasons or alternatives.
- [Atlas Obscura](https://www.atlasobscura.com/) treats lesser-known places as individual stories with a strong reason to visit, rather than as an undifferentiated list.
- [Responsible Travel's community-based tourism collection](https://www.responsibletravel.com/holidays/community-based-tourism) explains who benefits from a trip and how local people participate.

### Editorial rules

Hidden gems are hand-curated in `src/pages/index.astro`; the catalogue facets are in `src/data/catalogue.ts`. Keep this layer short and
human-readable; the complete destination inventory remains in `src/data/cities.ts` and the generated map data.

- Keep four trip types in `catalogue.ts`. Each needs a distinct traveler intent, a `stay`, its `seasons` and a `featured` list (shown first). A city not listed anywhere gets a trip type from its strongest pillar, so no city is missing from the filters. Seasons and stay are editorial; "what it offers" is computed (top third of the guide cities per pillar).
- Keep three hidden gems. Prefer smaller bases, family businesses, local producers, public transport or off-season travel over famous landmark lists.
- Each hidden gem shows *Ku shkojnë paratë*: the best-documented stay, meal and producer from `src/data/local/<slug>.json`
  (phone or website first), linked to their site, phone or OSM page. It is generated, so fix a wrong or missing business in OpenStreetMap.
- Use specific labels such as “Maj · qershor · shtator” or “Biçikletë”; avoid unsupported claims such as “eco-friendly,” “authentic” or exact crowd levels.
- Sustainability information should help a decision at the point where it appears. Do not repeat the same general message in every section.
- Recheck seasonal advice and practical claims before publishing. The labels are editorial guidance, not generated facts.

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
  pages/           top-level routes such as index and kontribuo; [slug].astro is the shared guide template for every city
  layouts/         BaseLayout: <head>, fonts, meta
  components/      Header, Footer, PlaceAtlas
  data/
    cities.ts      city list: copy, images, availability, OSM search area
    places.ts      types and helpers for the OSM place data
    osm/<slug>.json  places from OpenStreetMap + Wikimedia (generated, committed)
    cityFacts.ts / .json  Wikidata facts per city: population, area, elevation, description (generated, committed)
    local/<slug>.json  guesthouses, traditional food and local producers from OpenStreetMap (generated, committed)
    routes.json      walking routes for the maps (generated, committed); routes.ts has the types, routeData.ts the lookups
    municipalities.json  every municipality's outline and level for the region map (generated, committed)
  styles/          global.css
scripts/
  fetch-osm.ts     OpenStreetMap extractor
  enrich-wiki.ts   Wikidata / Wikipedia / Commons enrichment
  fetch-boundaries.ts  municipality outlines and levels
  fetch-routes.ts  marked walking routes (shtigje) with simplified lines
  fetch-local.ts   guesthouses, traditional restaurants, wine cellars, farms and crafts per municipality
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
- **Shtigje**: hiking, walking and cycling route relations (one complete route, not its member way segments), mountain huts, campsites
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

### Walking routes (shtigje)

`npm run routes` (`scripts/fetch-routes.ts`) reads the hiking and foot route relations from the Geofabrik extracts and
writes `src/data/routes.json`: name, marking, network (international to local), operator, length and a line
simplified to about 20 m. The length is the tagged one when the route has it, else measured, and only inside the
country for routes that cross the border. The routes are drawn on the home map (toggle "Shtigje ecjeje", 147 routes) and
on every city map, cut to what lies within 15 km of the centre (`routeRadiusM`). Guide pages list the nearest named ones,
each linking to [Waymarked Trails](https://hiking.waymarkedtrails.org) for the profile and waymarks. OpenStreetMap only
holds what mappers have added, so some areas have none.

The municipality trail pillar follows the same object model: a route relation counts once, while its member way
segments do not count again. Mountain huts and campsites remain separate trail-infrastructure features. This prevents
well-mapped routes from appearing as hundreds of distinct trails.

`src/data/trailSources.ts` adds a small, hand-curated reference layer for Via Dinarica Kosovo, Peaks of the Balkans,
High Scardus Trail and the Albanian National Tourism Agency hiking guide. `TrailSources.astro` shows the relevant
original sources on city pages. These are outbound references only: Locals does not copy GPX files unless the publisher
provides an explicit reusable licence. Commercial or private-use tracks must never be imported into the repository.

Both maps share `src/scripts/map-kit.ts`: the page keeps scrolling over a map (Ctrl + wheel zooms it, two fingers pan it on
touch screens, via `leaflet-gesture-handling`), buttons to reset the view and, on city maps, to find your position, and the
route lines with their popups. The home map also has a search box and layer toggles.

### City facts from Wikidata

Each city in `src/data/cities.ts` carries the Wikidata items of its town and of its municipality (`wikidata`).
`npm run cities` (`scripts/enrich-cities.ts`) reads them and writes `src/data/cityFacts.json`: a short description, the
first sentences of the Wikipedia article, population, area, elevation and website. The population comes from the
municipality's item (OpenStreetMap's `population` tag fills the gaps); the area is measured from the municipality
outline, because Wikidata's area statements mix towns and municipalities; the elevation is the town's. The map popups
and city guide pages show population, area and elevation. Wikidata is CC0; if you show the Wikipedia summaries, link
`summary.source` (CC BY-SA).

### Bujtina, traditional food and local producers

`npm run local` (`scripts/fetch-local.ts`) writes `src/data/local/<slug>.json` for every city: the businesses that let a
visitor stay, eat and buy from local people. It reads the same Geofabrik extracts and keeps what lies inside the city's
municipality outline (`municipalities.json`, so run `npm run boundaries` first), villages included. Three kinds
(`localKinds` in `src/data/local.ts`):

- **stay**: `tourism=guest_house`, `farm_stay`, `chalet`
- **food**: `amenity=restaurant` or `cafe` with a traditional `cuisine` (`regional`, `local`, `traditional`, `albanian`,
  `balkan`…) or a name such as *tradicional*, *bujtina*, *kulla*, *hani*, *taverna*
- **craft**: `tourism=wine_cellar`, farm and cheese shops, and a short list of visitable crafts (`craft=winery`, `beekeeper`,
  `pottery`, `weaver`…) — electricians, tailors and the like are left out

Each city keeps the best 40 of every kind, ranked by how documented they are (website, phone, hours, Wikidata…). The
`LocalGuide` component shows them on every city guide under *Bujtina & kuzhinë vendase*, with a link to improve each
one in the OSM editor. The rules are `localKind` and `toLocal` in `scripts/osm-common.ts`.

### City guide pages

`src/pages/[slug].astro` builds the guide page for every city in `src/data/cities.ts`, without city-specific page
exceptions. A guide has a photo hero with the Wikidata facts, the five sustainable-tourism counts for the municipality (`Çfarë ofron`), the city map, the place cards (`PlaceAtlas`), a short "about" text with its Wikipedia and
Wikidata links, and links to the other cities. It only uses generated data, so a new city gets a page once its
`src/data/osm/<slug>.json` and `cityFacts.json` entry exist.

### Alternativa e qetë

`src/data/alternatives.ts` picks, for each guide page, up to two smaller guide cities within 150 km whose pillar mix
(`municipalities.json`) is most similar, closer ones winning ties. `AlternativeCities` shows them before *Vazhdo udhëtimin*.
It is computed, so a new city needs no editing; cities with no smaller neighbour in reach simply show no section.

### Data freshness

`src/data/freshness.ts` reads the `fetchedAt` date of each generated file, and `DataFreshness` shows one date per source on
every guide, plus a warning when the oldest is more than `staleAfterDays` (180) old. The footer shows the site's latest
refresh. The dates come from the scripts, not the build, so rebuilding alone does not make the data look fresher: run
`npm run osm`, `local`, `routes`, `boundaries` and `cities` for that.

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

Locals does not keep its own database of places. Everything on the maps and guide pages is read from open projects, so
the best way to improve the site is to improve them. Your edits help every user of those projects, and they reach
Locals the next time the data is refreshed (`npm run osm`, `npm run boundaries`, `npm run routes`, `npm run cities`).

| Where | What to add | Shows up on Locals as |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org) | Places and their location: museums, viewpoints, castles, springs, guesthouses, marked trails | Map markers, place cards, walking routes, the five pillar counts |
| [Wikipedia](https://www.wikipedia.org) | The history and story of a place, in Albanian first | The "about" text and place summaries |
| [Wikidata](https://www.wikidata.org) | The link between the two, plus facts (population, image, description) | City facts, taglines, Commons photos |

### 1. OpenStreetMap: places and geography

Use OpenStreetMap for anything that has a position: points of interest, special places, trails and the services around
them. Create an account, then edit in the browser with the iD editor, or on your phone with
[StreetComplete](https://streetcomplete.app) or [Every Door](https://every-door.app).

Good things to map, matching what the scripts read:

- **Sights**: `tourism=museum`, `tourism=gallery`, `tourism=attraction`, `tourism=viewpoint`, `tourism=artwork`,
  `historic=*` (castles, ruins, archaeological sites, monuments), notable places of worship
- **Nature**: `natural=peak`, `natural=cave_entrance`, `natural=spring`, `waterway=waterfall`, national parks and protected areas
- **Routes**: hiking and walking route relations (`route=hiking`, `route=foot`) with `name`, `operator`, `network`
  and, if you walked it, a `distance`; mountain huts (`tourism=alpine_hut`), campsites
- **Local life**: guesthouses, farms, wine cellars, crafts, markets, and railway and bus stations

Tips for a place to be picked up and ranked well:

1. **Give it a `name`.** Unnamed features are skipped. Add `name:sq` and `name:en` where you know them.
2. **Add practical details**: `website`, `opening_hours`, `image` (a Wikimedia Commons file), and `heritage` tags for
   listed monuments. The score uses all of these.
3. **Add `wikidata=Q…`** (and `wikipedia=sq:Title`) to notable places. This is what connects the place to its story, see step 3.
   The iD editor can search for it, and notable places of worship are only included with a Wikidata link.
4. **Map only what you can see or verify** on the ground, from your own knowledge or from a free source. Do not copy
   from Google Maps or other copyrighted maps: OpenStreetMap is ODbL, and copying breaks its licence.
5. Read the [OSM wiki](https://wiki.openstreetmap.org/wiki/Tags) for the right tag, and add a clear changeset comment.

### 2. Wikipedia: history and context

Locals shows the first sentences of a place's Wikipedia article, so a good article is the best guide text there is.

- Write in **Albanian** ([sq.wikipedia.org](https://sq.wikipedia.org)) first: the site copy is Albanian, and the
  scripts try Albanian summaries before English. English is welcome too.
- Start with a clear opening sentence saying what the place is and where it is. The first two sentences are what
  Locals uses as the summary.
- Cover history, dating, people and events, and cite reliable, published sources. Wikipedia does not accept original
  research or unsourced claims.
- Add photos to [Wikimedia Commons](https://commons.wikimedia.org) under a free licence. Locals only uses Commons images,
  because it can look up their author and licence.
- Follow Wikipedia's rules on [neutral point of view](https://sq.wikipedia.org/wiki/Wikipedia:Këndvështrimi_asnjanës) and
  notability. A small village viewpoint may fit in the article of its village or municipality instead of its own page.

### 3. Wikidata: connecting the two

[Wikidata](https://www.wikidata.org) is the bridge. Every Wikipedia article and every notable place has a Wikidata
item (`Q…`). The Locals scripts follow the links in both directions:

```
OpenStreetMap feature ──wikidata=Q…──▶ Wikidata item ──sitelink──▶ Wikipedia article (sq, en)
                                            │
                                            └─ image (P18), description, population, coordinates ─▶ Commons, city facts
```

To connect a place:

1. Find or create the Wikidata item. Search by name first to avoid duplicates. If the place has a Wikipedia article,
   it already has one: open the article and choose "Wikidata item" in the tools menu.
2. Fill in the basics: a label and short description in Albanian and English, `instance of` (P31, for example castle,
   museum, mosque), `country` (P17), `located in the administrative territorial entity` (P131), and `coordinate location` (P625).
3. Add the `image` (P18) from Commons, and the Wikipedia articles as sitelinks. Locals reads the description and image
   from here.
4. Copy the item's ID into the OpenStreetMap feature as `wikidata=Q…`. Add the `wikipedia=sq:Title` tag only if you
   want to; the Wikidata tag is the important one, and the `wikipedia` tag is optional.
5. Add the OpenStreetMap relation ID to the item as `OpenStreetMap relation ID` (P402), for municipalities and other
   areas, or `OSM node/way ID` where it fits. For a new Locals city this is also the `boundary` in `src/data/cities.ts`.

Check your work: on the OSM feature the `wikidata` link should open the right item, the item's sitelinks should
open the right article, and the coordinates should agree with the map.

### 4. Seeing your edit on Locals

OSM edits appear on [openstreetmap.org](https://www.openstreetmap.org) within minutes, Wikipedia and Wikidata edits
at once. Locals only changes when the data is refreshed and the site rebuilt, and the Geofabrik extracts are updated
daily. If you want to trigger a refresh, or the change does not appear, open an issue.

### Code, new cities and corrections

- **A new city**: see [Adding a city](#adding-a-city). Before you open an issue or pull request, check that the place
  is well mapped in OpenStreetMap and has a Wikidata item.
- **Code or copy**: pull requests are welcome. Run `npm run build` before submitting. Site copy is in Albanian.
- **Anything else**: know a city well? Write to [illyrianbrains@gmail.com](mailto:illyrianbrains@gmail.com).

Please follow the rules of each project when you edit it, and never add personal data or copy-protected material.

## License

Code: [AGPL-3.0](LICENSE). OpenStreetMap data: ODbL, see above.
