export type CountryCode = 'al' | 'xk';

export const countries: Record<CountryCode, { name: string; slug: string }> = {
  al: { name: 'Shqipëri', slug: 'shqiperi' },
  xk: { name: 'Kosovë', slug: 'kosove' },
};

export interface City {
  slug: string;
  name: string;
  country: CountryCode;
  region: string;
  summary: string;
  tags: string[];
  image: string;
  credit: string;
  available: boolean;
  /**
   * Centre point and search radius (metres) used by scripts/fetch-osm.ts, and the OSM relation id of the
   * municipality (Bashkia / Komuna) drawn on the region map by scripts/fetch-boundaries.ts.
   */
  osm: { lat: number; lon: number; radius: number; boundary: number };
}

export const cities: City[] = [
  { slug: 'tirane', name: 'Tiranë', country: 'al', region: 'Qendra', summary: 'Ritëm urban, histori dhe natyrë në këmbët e Dajtit.', tags: ['Në këmbë', 'Kulturë', 'Kuzhinë'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Skanderbeg%20square%2C%20Tiran%C3%AB%2C%20Albania%20.jpg?width=1400', credit: 'Meriboo · CC BY-SA 3.0', available: true, osm: { lat: 41.3275, lon: 19.8187, radius: 4000, boundary: 1250113 } },
  { slug: 'shkoder', name: 'Shkodër', country: 'al', region: 'Veriu', summary: 'Qyteti i biçikletave, liqenit dhe portës drejt Alpeve.', tags: ['Biçikletë', 'Natyrë', 'Traditë'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Shkodra%20view.jpg?width=1200', credit: 'Wikimedia Commons', available: false, osm: { lat: 42.0683, lon: 19.5126, radius: 4000, boundary: 1248284 } },
  { slug: 'berat', name: 'Berat', country: 'al', region: 'Jugu', summary: 'Lagje historike, mjeshtëri vendase dhe shëtitje buzë Osumit.', tags: ['UNESCO', 'Artizanat', 'Slow travel'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Berat%2C%20Albania.jpg?width=1200', credit: 'Wikimedia Commons', available: false, osm: { lat: 40.7058, lon: 19.9522, radius: 3000, boundary: 7689922 } },
  { slug: 'korce', name: 'Korçë', country: 'al', region: 'Juglindja', summary: 'Arkitekturë, serenata dhe prodhues të vegjël mes maleve.', tags: ['Kulturë', 'Ushqim lokal', 'Ecje'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Korca%20Albania.jpg?width=1200', credit: 'Wikimedia Commons', available: false, osm: { lat: 40.6186, lon: 20.7808, radius: 3000, boundary: 1252572 } },
  { slug: 'gjirokaster', name: 'Gjirokastër', country: 'al', region: 'Jugu', summary: 'Qyteti i gurtë, shtëpitë karakteristike dhe zanatet e vjetra.', tags: ['UNESCO', 'Trashëgimi', 'Artizanat'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Gjirokastra%20-%20Albania.jpg?width=1200', credit: 'Wikimedia Commons', available: false, osm: { lat: 40.0758, lon: 20.1389, radius: 3000, boundary: 1253902 } },
  { slug: 'vlore', name: 'Vlorë', country: 'al', region: 'Bregdeti', summary: 'Det, laguna dhe udhëtime të ngadalta përgjatë jugut.', tags: ['Bregdet', 'Natyrë', 'Prodhime lokale'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Vlore%2C%20Albania.jpg?width=1200', credit: 'Wikimedia Commons', available: false, osm: { lat: 40.4661, lon: 19.4914, radius: 5000, boundary: 1255543 } },
  { slug: 'prishtine', name: 'Prishtinë', country: 'xk', region: 'Qendra', summary: 'Kafene, energji e re dhe një kryeqytet që ndërtohet çdo ditë.', tags: ['Kafe', 'Kulturë', 'Jetë urbane'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Newborn%20Pristina%20February%202013.jpg?width=1200', credit: 'Arild Vågen · CC BY-SA 3.0', available: false, osm: { lat: 42.6629, lon: 21.1655, radius: 4000, boundary: 1332181 } },
  { slug: 'prizren', name: 'Prizren', country: 'xk', region: 'Jugu', summary: 'Kalaja, Lumbardhi dhe rrugica ku takohen shekujt.', tags: ['Trashëgimi', 'Ecje', 'Festivale'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Prizren%20panorama.jpg?width=1200', credit: 'Janusz Recław · CC BY-SA 4.0', available: false, osm: { lat: 42.2139, lon: 20.7397, radius: 3000, boundary: 1332193 } },
  { slug: 'peje', name: 'Pejë', country: 'xk', region: 'Dukagjini', summary: 'Porta drejt Rugovës, me çarshi, ujëra të ftohta dhe male.', tags: ['Natyrë', 'Ecje', 'Çarshi'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Peja%20Kosovo%201.jpg?width=1200', credit: 'a.dombrowski · CC BY-SA 2.0', available: false, osm: { lat: 42.6593, lon: 20.2887, radius: 3000, boundary: 1332187 } },
  { slug: 'gjakove', name: 'Gjakovë', country: 'xk', region: 'Dukagjini', summary: 'Çarshia e Madhe, zejtarët dhe ritmi i qytetit të vjetër.', tags: ['Çarshi', 'Artizanat', 'Histori'], image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Street%20in%20the%20Old%20Bazaar%20of%20Gjakova%2C%202025.jpg?width=1200', credit: 'Bdx · CC0', available: false, osm: { lat: 42.3803, lon: 20.4308, radius: 3000, boundary: 1332169 } },
];

export const cityLabel = (city: City) => `${countries[city.country].name} · ${city.region}`;
