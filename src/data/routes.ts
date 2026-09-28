/**
 * Marked walking routes (shtigje) from OpenStreetMap, extracted by scripts/fetch-routes.ts (data © OpenStreetMap
 * contributors, ODbL). Lines are [lon, lat] and already simplified for maps. This file is light enough for the
 * browser; the route data itself is in routeData.ts (server side) and routes.json (loaded by the region map).
 */
export interface Route {
  /** OpenStreetMap relation id. */
  id: number;
  country: 'al' | 'xk';
  name?: string;
  /** Short marking on the trail, e.g. "POB". */
  ref?: string;
  /** International, national, regional or local walking network (OSM `network`). */
  network?: 'iwn' | 'nwn' | 'rwn' | 'lwn';
  operator?: string;
  /** Length in km: the tagged length of the whole route, else what was measured. */
  km: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  lines: [number, number][][];
}

export const networkLabels: Record<NonNullable<Route['network']>, string> = {
  iwn: 'Ndërkombëtar',
  nwn: 'Kombëtar',
  rwn: 'Rajonal',
  lwn: 'Lokal',
};

export const routeTitle = (route: Pick<Route, 'name' | 'ref'>) => route.name ?? (route.ref ? `Shtegu ${route.ref}` : 'Shteg i shënuar');
/** Waymarked Trails shows the route's elevation profile, waymarks and description. */
export const routeUrl = (route: Pick<Route, 'id'>) => `https://hiking.waymarkedtrails.org/#route?id=${route.id}`;
export const routeColor = '#d9822b';
/** How far from a city's centre its maps and guide look for walking routes: far enough to reach the mountain trailheads. */
export const routeRadiusM = 15_000;
