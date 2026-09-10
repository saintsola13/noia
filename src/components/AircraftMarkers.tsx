import L from 'leaflet';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import type { Aircraft } from '../lib/types';
import { formatAltitudeFt, formatHeading, formatSpeedKt } from '../lib/geo';

function planeIcon(heading: number | null) {
  const rot = heading ?? 0;
  return L.divIcon({
    className: 'ac-marker',
    html: `<div class="ac-glyph" style="transform:rotate(${rot}deg)">✈</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

interface Props {
  aircraft: Aircraft[];
}

export function AircraftMarkers({ aircraft }: Props) {
  return (
    <>
      {aircraft.map((ac) => (
        <Marker
          key={ac.icao24}
          position={[ac.lat, ac.lon]}
          icon={planeIcon(ac.heading)}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            <span className="ac-tip">
              {ac.callsign} · {formatAltitudeFt(ac.baroAltitude ?? ac.geoAltitude)}
            </span>
          </Tooltip>
          <Popup>
            <div className="ac-popup">
              <strong>{ac.callsign}</strong>
              <div>ICAO {ac.icao24}</div>
              <div>ALT {formatAltitudeFt(ac.baroAltitude ?? ac.geoAltitude)}</div>
              <div>SPD {formatSpeedKt(ac.velocity)}</div>
              <div>HDG {formatHeading(ac.heading)}</div>
              <div className="ac-source">ADS-B (OpenSky) — not military radar</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
