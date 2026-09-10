/** Approximate degrees for a km radius at a given latitude. */
export function radiusToBbox(lat: number, lon: number, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    lamin: lat - latDelta,
    lamax: lat + latDelta,
    lomin: lon - lonDelta,
    lomax: lon + lonDelta,
  };
}

export function isUsZip(q: string): boolean {
  return /^\d{5}$/.test(q.trim());
}

export function formatAltitudeFt(meters: number | null): string {
  if (meters == null || Number.isNaN(meters)) return '—';
  return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
}

export function formatSpeedKt(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return `${Math.round(ms * 1.94384)} kt`;
}

export function formatHeading(deg: number | null): string {
  if (deg == null || Number.isNaN(deg)) return '—';
  return `${Math.round(deg).toString().padStart(3, '0')}°`;
}
