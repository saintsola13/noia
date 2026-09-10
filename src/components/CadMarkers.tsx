import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import type { CadIncident } from '../lib/types';

function cadColor(type: string): string {
  const t = type || '';
  if (/fire|collision|crash|1183|1179|injury|shoot|stab|rescue|accident|hazmat/i.test(t)) {
    return '#c44';
  }
  if (/construction|closure|roadwork|lane\s*closed|maintenance|detour/i.test(t)) {
    return '#c9a227';
  }
  if (/disabled|other|stall|vehicle/i.test(t)) {
    return '#3db8c9';
  }
  return '#c9a227';
}

function sirenHtml(color: string): string {
  return `<div class="cad-siren" style="--cad-color:${color}">
    <svg class="cad-siren-svg" viewBox="0 0 32 32" aria-hidden="true">
      <ellipse class="cad-siren-glow" cx="16" cy="18" rx="11" ry="8"/>
      <path class="cad-siren-dome" d="M8 18 C8 10 12 6 16 6 C20 6 24 10 24 18 Z"/>
      <rect class="cad-siren-base" x="7" y="17" width="18" height="6" rx="1.5"/>
      <rect class="cad-siren-foot" x="9" y="22.5" width="14" height="2.5" rx="1"/>
      <circle class="cad-siren-lens" cx="16" cy="13" r="3.2"/>
    </svg>
  </div>`;
}

function cadIcon(type: string) {
  const color = cadColor(type);
  return L.divIcon({
    className: 'cad-marker',
    html: sirenHtml(color),
    iconSize: [30, 30],
    iconAnchor: [15, 22],
    popupAnchor: [0, -18],
  });
}

interface MarkerProps {
  incident: CadIncident;
  focusId?: string | null;
  source?: string | null;
}

function CadMarkerItem({ incident: inc, focusId, source }: MarkerProps) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (focusId === inc.id) {
      const marker = markerRef.current;
      if (marker) {
        marker.openPopup();
      }
    }
  }, [focusId, inc.id]);

  return (
    <Marker
      ref={markerRef}
      position={[inc.lat, inc.lon]}
      icon={cadIcon(inc.type)}
      opacity={focusId && focusId !== inc.id ? 0.55 : 1}
      zIndexOffset={focusId === inc.id ? 800 : 400}
      eventHandlers={{
        add: (e) => {
          if (focusId === inc.id) {
            e.target.openPopup();
          }
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
        <span className="cad-tip">{inc.type}</span>
      </Tooltip>
      <Popup>
        <div className="cad-popup">
          <strong className="cad-popup-type">{inc.type || 'Incident'}</strong>
          <div className="cad-popup-row">
            <span className="cad-popup-label">Location</span>
            <span>{inc.location || '—'}</span>
          </div>
          {inc.area ? (
            <div className="cad-popup-row">
              <span className="cad-popup-label">Area</span>
              <span>{inc.area}</span>
            </div>
          ) : null}
          <div className="cad-popup-row">
            <span className="cad-popup-label">Logged</span>
            <span>{inc.logTime || '—'}</span>
          </div>
          {inc.locationDesc ? (
            <div className="cad-popup-desc">{inc.locationDesc}</div>
          ) : null}
          {inc.details.length > 0 && (
            <ul className="cad-popup-details">
              {inc.details.map((d, i) => (
                <li key={`${inc.id}-d-${i}`}>{d}</li>
              ))}
            </ul>
          )}
          {inc.units.length > 0 && (
            <div className="cad-units">Units: {inc.units.join(' · ')}</div>
          )}
          <div className="cad-source">
            {source || 'Public CAD feed'} — not city 911 CAD
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

interface Props {
  incidents: CadIncident[];
  focusId?: string | null;
  source?: string | null;
}

export function CadMarkers({ incidents, focusId, source }: Props) {
  return (
    <>
      {incidents.map((inc) => (
        <CadMarkerItem
          key={inc.id}
          incident={inc}
          focusId={focusId}
          source={source}
        />
      ))}
    </>
  );
}
