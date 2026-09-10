import { Polygon, Popup } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { WeatherAlert } from '../lib/types';

interface Props {
  alerts: WeatherAlert[];
}

/** GeoJSON [lon, lat] rings → Leaflet [lat, lon] positions. */
function ringToLatLngs(ring: unknown): LatLngExpression[] | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const out: LatLngExpression[] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push([lat, lon]);
  }
  return out.length >= 3 ? out : null;
}

function geometryToPolygons(geom: WeatherAlert['geometry']): LatLngExpression[][] {
  if (!geom || !geom.coordinates) return [];
  const polys: LatLngExpression[][] = [];
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as unknown[];
    const outer = ringToLatLngs(rings?.[0]);
    if (outer) polys.push(outer);
  } else if (geom.type === 'MultiPolygon') {
    const multi = geom.coordinates as unknown[];
    for (const poly of multi) {
      if (!Array.isArray(poly)) continue;
      const outer = ringToLatLngs(poly[0]);
      if (outer) polys.push(outer);
    }
  }
  return polys;
}

export function AlertPolygons({ alerts }: Props) {
  return (
    <>
      {alerts.map((alert) => {
        const polys = geometryToPolygons(alert.geometry);
        return polys.map((positions, idx) => (
          <Polygon
            key={`${alert.id}-${idx}`}
            positions={positions}
            pathOptions={{
              color: alert.color,
              weight: 2,
              opacity: 0.85,
              fillColor: alert.color,
              fillOpacity: 0.12,
            }}
          >
            <Popup>
              <div className="wx-popup">
                <strong style={{ color: alert.color }}>{alert.event}</strong>
                <div className="wx-popup-sev">{alert.severity}</div>
                <div className="wx-popup-head">{alert.headline}</div>
                {alert.areaDesc ? <div className="wx-popup-area">{alert.areaDesc}</div> : null}
              </div>
            </Popup>
          </Polygon>
        ));
      })}
    </>
  );
}
