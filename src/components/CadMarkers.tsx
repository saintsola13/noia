import L from 'leaflet';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import type { CadIncident } from '../lib/types';

function cadIcon(type: string) {
  const hot = /fire|collision|1183|1179|injury|shoot|stab|rescue/i.test(type);
  const color = hot ? '#c44' : '#c9a227';
  return L.divIcon({
    className: 'cad-marker',
    html: `<div class="cad-glyph" style="--cad-color:${color}"><span class="cad-diamond"></span></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

interface Props {
  incidents: CadIncident[];
  focusId?: string | null;
}

export function CadMarkers({ incidents, focusId }: Props) {
  return (
    <>
      {incidents.map((inc) => (
        <Marker
          key={inc.id}
          position={[inc.lat, inc.lon]}
          icon={cadIcon(inc.type)}
          opacity={focusId && focusId !== inc.id ? 0.55 : 1}
          zIndexOffset={focusId === inc.id ? 800 : 400}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            <span className="cad-tip">{inc.type}</span>
          </Tooltip>
          <Popup>
            <div className="cad-popup">
              <strong>{inc.type || 'Incident'}</strong>
              <div>{inc.location || '—'}</div>
              {inc.locationDesc ? <div className="cad-muted">{inc.locationDesc}</div> : null}
              <div>{inc.area ? `${inc.area} · ` : ''}{inc.logTime || '—'}</div>
              {inc.units.length > 0 && (
                <div className="cad-units">Units: {inc.units.slice(0, 4).join(' · ')}</div>
              )}
              <div className="cad-source">CHP public sa.xml — not city 911 CAD</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
