import { useEffect } from 'react';
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Aircraft } from '../lib/types';
import type { RadarMeta } from '../lib/types';
import { AircraftMarkers } from './AircraftMarkers';
import { RadarLayer } from './RadarLayer';
import 'leaflet/dist/leaflet.css';

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom() < 9 ? 10 : map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
}

interface Props {
  lat: number;
  lon: number;
  radiusKm: number;
  aircraft: Aircraft[];
  radarMeta: RadarMeta | null;
  showRadar: boolean;
}

export function MapView({ lat, lon, radiusKm, aircraft, radarMeta, showRadar }: Props) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={10}
      className="ops-map"
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      {showRadar && <RadarLayer meta={radarMeta} />}
      <Circle
        center={[lat, lon]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: '#6b8f3c',
          weight: 1,
          dashArray: '6 8',
          fillColor: '#6b8f3c',
          fillOpacity: 0.06,
        }}
      />
      <AircraftMarkers aircraft={aircraft} />
      <Recenter lat={lat} lon={lon} />
    </MapContainer>
  );
}
