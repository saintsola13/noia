export interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
  city?: string;
  county?: string;
  state?: string;
  stateCode?: string;
  country?: string;
  postcode?: string;
}

export interface Aircraft {
  icao24: string;
  callsign: string;
  originCountry: string;
  lon: number;
  lat: number;
  baroAltitude: number | null;
  geoAltitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
}

export interface RadarFrame {
  time: number;
  path: string;
}

/** RainViewer weather-maps.json (v2) shape after /api/radar proxy. */
export interface RadarMeta {
  version?: string;
  host: string;
  generated?: number;
  radar: {
    past: RadarFrame[];
    nowcast?: RadarFrame[];
  };
  satellite?: {
    infrared?: RadarFrame[];
  };
}

export interface ScannerLinks {
  lat: number;
  lon: number;
  locationLabel: string;
  county?: string;
  state?: string;
  stateCode?: string;
  links: {
    label: string;
    url: string;
    source: 'broadcastify' | 'radioreference' | 'other';
  }[];
  disclaimer: string;
}

export interface AppLocation {
  lat: number;
  lon: number;
  label: string;
  radiusKm: number;
}
