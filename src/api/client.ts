import type { Aircraft, GeoResult, RadarMeta, ScannerLinks } from '../lib/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function geocode(q: string): Promise<GeoResult> {
  return getJson(`/api/geocode?q=${encodeURIComponent(q)}`);
}

export function fetchAircraft(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<{ aircraft: Aircraft[]; count: number; bbox: Record<string, number> }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radiusKm: String(radiusKm),
  });
  return getJson(`/api/aircraft?${params}`);
}

export function fetchRadar(): Promise<RadarMeta> {
  return getJson('/api/radar');
}

export function fetchScanners(lat: number, lon: number): Promise<ScannerLinks> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return getJson(`/api/scanners?${params}`);
}
