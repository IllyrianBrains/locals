/**
 * Browser helpers shared by the region map and the city maps: a Leaflet map that does not trap page scrolling,
 * small buttons, and the walking routes (shtigje) with their popup.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-gesture-handling';
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';
import { networkLabels, routeColor, routeTitle, routeUrl, type Route } from '../data/routes';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A map that scrolls past on the page: Ctrl + wheel zooms it, and touch screens pan it with two fingers. */
export function createMap(el: HTMLElement, options: L.MapOptions = {}): L.Map {
  return L.map(el, {
    ...options,
    gestureHandling: true,
    gestureHandlingOptions: {
      text: {
        touch: 'Përdor dy gishta për të lëvizur hartën',
        scroll: 'Përdor Ctrl + rrotën për të zoomuar',
        scrollMac: 'Përdor ⌘ + rrotën për të zoomuar',
      },
    },
  } as L.MapOptions);
}

/** A text button in the map's top-left corner, under the zoom buttons. */
export function addButton(map: L.Map, symbol: string, title: string, onClick: () => void): void {
  const Button = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const link = L.DomUtil.create('a', 'map-button', bar);
      link.href = '#';
      link.title = title;
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', title);
      link.textContent = symbol;
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(link, 'click', (event) => { L.DomEvent.preventDefault(event); onClick(); });
      return bar;
    },
  });
  new Button({ position: 'topleft' }).addTo(map);
}

/** Popup content: like the other map popups, a small label, the name, a line of facts and a link. */
export function routePopup(route: Pick<Route, 'id' | 'name' | 'ref' | 'network' | 'km' | 'operator'>): string {
  const kind = [route.network && networkLabels[route.network], route.ref].filter(Boolean).join(' · ') || 'Shteg ecjeje';
  const facts = [`${route.km.toLocaleString('sq-AL')} km`, route.operator].filter(Boolean).join(' · ');
  return `<span>${esc(kind)}</span><b>${esc(routeTitle(route))}</b><p>${esc(facts)}</p><a href="${routeUrl(route)}" target="_blank" rel="noreferrer">Detajet e shtegut ↗</a>`;
}

interface RouteOptions {
  /** Wraps the popup content, e.g. in the region map's dark popup markup. */
  wrap?: (html: string) => string;
  /** z-index of the pane the routes live in: above 400 to sit over the map's polygons, below to sit under its markers. */
  zIndex?: number;
  tooltipClass?: string;
}

/** Draws the routes as orange lines, each with a wide invisible line on top so it is easy to hit with a finger. */
export function addRoutes(map: L.Map, routes: Route[], { wrap = (html) => html, zIndex = 450, tooltipClass = 'route-tip' }: RouteOptions = {}): L.FeatureGroup {
  // A pane of their own keeps the routes stacked right when polygons are brought to the front on hover.
  const pane = map.getPane('routes') ?? map.createPane('routes');
  pane.style.zIndex = String(zIndex);
  const group = L.featureGroup();
  for (const route of routes) {
    const latlngs = route.lines.map((line) => line.map(([lon, lat]) => [lat, lon] as L.LatLngTuple));
    const line = L.polyline(latlngs, { pane: 'routes', color: routeColor, weight: 3, opacity: 0.9, lineJoin: 'round', interactive: false });
    const hit = L.polyline(latlngs, { pane: 'routes', weight: 16, opacity: 0 });
    hit.bindPopup(wrap(routePopup(route)), { autoPanPadding: [30, 30] });
    hit.bindTooltip(esc(routeTitle(route)), { sticky: true, direction: 'top', className: tooltipClass, offset: [0, -6] });
    hit.on('mouseover', () => line.setStyle({ weight: 5, opacity: 1 }));
    hit.on('mouseout', () => line.setStyle({ weight: 3, opacity: 0.9 }));
    group.addLayer(line).addLayer(hit);
  }
  return group.addTo(map);
}
