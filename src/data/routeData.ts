/** The route data, for pages built on the server: routes near a city. */
import data from './routes.json';
import type { Route } from './routes';

export const allRoutes = data.routes as Route[];

const metres = (a: [number, number], lat: number, lon: number) =>
  Math.hypot((a[1] - lat) * 111_320, (a[0] - lon) * 111_320 * Math.cos((lat * Math.PI) / 180));

/**
 * The routes with a stretch within `radiusM` of a point, each cut down to that stretch, so a 180 km route
 * does not stretch a city map across a country. Nearest first.
 */
export function routesNear(lat: number, lon: number, radiusM: number): (Route & { nearM: number })[] {
  const found: (Route & { nearM: number })[] = [];
  for (const route of allRoutes) {
    const lines: [number, number][][] = [];
    let nearM = Infinity;
    for (const line of route.lines) {
      let current: [number, number][] = [];
      for (const point of line) {
        const d = metres(point, lat, lon);
        nearM = Math.min(nearM, d);
        if (d <= radiusM) current.push(point);
        else if (current.length) { lines.push(current); current = []; }
      }
      if (current.length) lines.push(current);
    }
    if (lines.some((line) => line.length > 1)) found.push({ ...route, lines: lines.filter((line) => line.length > 1), nearM });
  }
  return found.sort((a, b) => a.nearM - b.nearM);
}
