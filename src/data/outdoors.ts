/**
 * Hiking trails and other outdoor escapes reachable from each city, keyed by city slug.
 * Hand-curated: check distances, times and access before adding or changing an entry.
 */

export type OutdoorKind = 'Ecje' | 'Ngjitje' | 'Teleferik' | 'Biçikletë' | 'Shpellë' | 'Liqen';

export interface Outdoor {
  title: string;
  kinds: OutdoorKind[];
  text: string;
  /** Approximate one-way or loop length, e.g. "≈ 5 km unazë". */
  distance?: string;
  duration?: string;
  /** 1 = easy, 2 = moderate, 3 = demanding. */
  level: 1 | 2 | 3;
  /** How to reach the start without a car, when possible. */
  access: string;
  map: string;
}

export const levelLabels: Record<Outdoor['level'], string> = { 1: 'E lehtë', 2: 'Mesatare', 3: 'E vështirë' };

export const outdoors: Record<string, Outdoor[]> = {
  tirane: [
    {
      title: 'Unaza e Liqenit Artificial',
      kinds: ['Ecje', 'Liqen'],
      text: 'Shteg me hije rreth liqenit të Parkut të Madh. Ideal në mëngjes herët ose në perëndim të diellit.',
      distance: '≈ 5 km unazë',
      duration: '1–1,5 orë',
      level: 1,
      access: 'Në këmbë nga qendra, rreth 20 minuta.',
      map: 'Liqeni Artificial Tirana',
    },
    {
      title: 'Mali i Dajtit',
      kinds: ['Teleferik', 'Ngjitje'],
      text: 'Ngjitu me teleferikun Dajti Ekspres ose në këmbë nga Linza. Lart të presin pyje ahu, shtigje dhe pamja mbi gjithë fushën.',
      duration: 'Gjysmë dite',
      level: 2,
      access: 'Autobus urban drejt stacionit të teleferikut në Linzë.',
      map: 'Dajti Ekspres Tirana',
    },
    {
      title: 'Liqeni i Farkës',
      kinds: ['Ecje', 'Biçikletë'],
      text: 'Rrugë e sheshtë rreth liqenit në skajin juglindor të qytetit, e përshtatshme për biçikletë ose një shëtitje të gjatë.',
      duration: '1–2 orë',
      level: 1,
      access: 'Autobus urban ose biçikletë nga qendra.',
      map: 'Liqeni i Farkes Tirana',
    },
    {
      title: 'Shpella e Pëllumbasit',
      kinds: ['Ecje', 'Shpellë'],
      text: 'Shteg përgjatë kanionit të Erzenit deri te një shpellë me gjurmë parahistorike. Merr këpucë të mira dhe një llambë.',
      duration: '≈ 1 orë deri te shpella',
      level: 2,
      access: 'Rreth 25 km nga Tirana; fillon te fshati Pëllumbas.',
      map: 'Shpella e Pellumbasit',
    },
  ],
};

export function getOutdoors(slug: string): Outdoor[] {
  return outdoors[slug] ?? [];
}
