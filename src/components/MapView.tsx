import { useEffect } from 'react';
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Aircraft, CadIncident, RadarMeta } from '../lib/types';
import { AircraftMarkers } from './AircraftMarkers';
import { CadMarkers } from './CadMarkers';
import { RadarLayer } from './RadarLayer';
import 'leaflet/dist/leaflet.css';

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom() < 9 ? 10 : map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
}

/** Leaflet maps break when mounted inside display:none; invalidate when wrap becomes visible. */
function MapInvalidator({ layoutKey }: { layoutKey: string | number }) {
  const map = useMap();

  useEffect(() => {
    const run = () => {
      map.invalidateSize({ animate: false });
    };
    run();
    const t1 = window.setTimeout(run, 50);
    const t2 = window.setTimeout(run, 250);
    const t3 = window.setTimeout(run, 500);

    const container = map.getContainer();
    const wrap = container.parentElement;
    let ro: ResizeObserver | null = null;
    if (wrap && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => run());
      ro.observe(wrap);
      ro.observe(container);
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro?.disconnect();
    };
  }, [layoutKey, map]);

  return null;
}

function FocusCad({
  focus,
}: {
  focus: { lat: number; lon: number; id: string } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 12), {
      animate: true,
      duration: 0.6,
    });
    const t = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 100);
    return () => window.clearTimeout(t);
  }, [focus, map]);
  return null;
}

interface Props {
  lat: number;
  lon: number;
  radiusKm: number;
  aircraft: Aircraft[];
  cadIncidents: CadIncident[];
  showCad: boolean;
  cadSource?: string | null;
  focusCadId?: string | null;
  focusCad?: { lat: number; lon: number; id: string } | null;
  radarMeta: RadarMeta | null;
  showRadar: boolean;
  mapLayoutKey?: string | number;
  dimAircraft?: boolean;
}

export function MapView({
  lat,
  lon,
  radiusKm,
  aircraft,
  cadIncidents,
  showCad,
  cadSource,
  focusCadId,
  focusCad,
  radarMeta,
  showRadar,
  mapLayoutKey = 'map',
  dimAircraft = false,
}: Props) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={10}
      className="ops-map"
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri — Dark Gray Canvas'
        maxZoom={16}
      />
      {showRadar && <RadarLayer meta={radarMeta} />}
      <Circle
        center={[lat, lon]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: '#3db8c9',
          weight: 1,
          dashArray: '6 8',
          fillColor: '#3db8c9',
          fillOpacity: 0.05,
        }}
      />
      <AircraftMarkers aircraft={aircraft} dim={dimAircraft} />
      {showCad && (
        <CadMarkers incidents={cadIncidents} focusId={focusCadId} source={cadSource} />
      )}
      <Recenter lat={lat} lon={lon} />
      <FocusCad focus={focusCad ?? null} />
      <MapInvalidator layoutKey={mapLayoutKey} />
    </MapContainer>
  );
}
