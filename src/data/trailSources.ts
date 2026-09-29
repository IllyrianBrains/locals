/**
 * Curated trail collections that complement OSM route relations.
 *
 * These are outbound references only. We do not copy GPX geometry unless a source publishes an explicit reusable
 * licence. `cities` controls where a collection is shown; keep it limited to useful trailheads and nearby bases.
 */
export interface TrailSource {
  title: string;
  source: string;
  url: string;
  scope: string;
  note: string;
  cities: string[];
}

export const trailSources: TrailSource[] = [
  {
    title: 'Via Dinarica Kosovë',
    source: 'Via Dinarica Kosovo',
    url: 'https://viadinaricakosovo.com/sq/track/',
    scope: 'Etapa · GPX',
    note: 'Etapa të përshkruara në Bjeshkët e Nemuna, me gjatësi dhe skedarë GPX nga projekti.',
    cities: ['peje', 'decan', 'gjakove', 'bajram-curri'],
  },
  {
    title: 'Peaks of the Balkans',
    source: 'Faqja zyrtare e shtegut',
    url: 'https://peaksofthebalkans.at/en/stages/',
    scope: 'Shteg ndërkufitar',
    note: 'Etapat zyrtare të itinerarit rrethor mes Shqipërisë, Kosovës dhe Malit të Zi.',
    cities: ['shkoder', 'bajram-curri', 'malesi-e-madhe', 'peje', 'decan'],
  },
  {
    title: 'High Scardus Trail',
    source: 'Portali i shtegut',
    url: 'https://www.high-scardus-trail.com/',
    scope: 'Shteg ndërkufitar',
    note: 'Itinerar shumëditor në malet e Sharrit dhe Korabit, mes Kosovës, Shqipërisë dhe Maqedonisë së Veriut.',
    cities: ['prizren', 'shterpce', 'kukes', 'peshkopi'],
  },
  {
    title: 'Hiking Trails Albania',
    source: 'Agjencia Kombëtare e Turizmit',
    url: 'https://akt.gov.al/wp-content/uploads/2022/09/HIKING-TRAILS.pdf',
    scope: 'Guidë zyrtare · PDF',
    note: 'Guidë kombëtare për verifikimin editorial të shtigjeve; nuk përdoret si burim automatik gjeometrie.',
    cities: ['shkoder', 'bajram-curri', 'malesi-e-madhe', 'permet', 'kolonje', 'korce', 'pogradec', 'gjirokaster', 'himare', 'kruje', 'peshkopi', 'kukes'],
  },
];

export const trailSourcesFor = (slug: string) => trailSources.filter((source) => source.cities.includes(slug));
