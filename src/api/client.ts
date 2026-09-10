import type {
  Aircraft,
  GeoResult,
  OpenMhzCallsResponse,
  OpenMhzSystemsResponse,
  RadarMeta,
  ScannerLinks,
} from '../lib/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) throw new Error(body.error);
    } catch (err) {
      if (err instanceof Error && err.message && !err.message.startsWith('{')) throw err;
    }
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

/** OpenMHz allows browser CORS; cloud egress is often 403 — call it client-side. */
export async function fetchOpenMhzSystems(
  lat: number,
  lon: number,
): Promise<OpenMhzSystemsResponse> {
  const { pickOpenMhzSystems, normalizeStateCode } = await import('../lib/openmhzMatch');
  const place = await fetchScanners(lat, lon);
  const stateCode = normalizeStateCode(place.stateCode || place.state);
  if (!stateCode) throw new Error('Could not resolve US state for OpenMHz');

  const res = await fetch('https://api.openmhz.com/systems', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenMHz systems error (${res.status})`);
  const data = (await res.json()) as { systems?: import('../lib/openmhzMatch').RawOpenMhzSystem[] };
  const systems = pickOpenMhzSystems(data.systems || [], {
    stateCode,
    city: place.city,
    county: place.county,
  });
  return {
    systems,
    locationLabel: place.locationLabel,
    attribution: 'Audio via OpenMHz',
  };
}

export async function fetchOpenMhzCalls(shortName: string): Promise<OpenMhzCallsResponse> {
  if (!/^[a-z0-9_-]+$/i.test(shortName)) {
    throw new Error('Invalid OpenMHz system id');
  }
  const res = await fetch(`https://api.openmhz.com/${encodeURIComponent(shortName)}/calls`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenMHz calls error (${res.status})`);
  const data = (await res.json()) as {
    calls?: {
      _id?: string;
      id?: string;
      talkgroupNum?: number;
      url?: string;
      time?: string;
      len?: number;
      freq?: number;
    }[];
  };
  const calls = (data.calls || [])
    .filter((c) => c && c.url)
    .map((c) => ({
      id: String(c._id || c.id || `${c.talkgroupNum}-${c.time}`),
      talkgroupNum: Number(c.talkgroupNum) || 0,
      url: String(c.url),
      time: c.time || '',
      len: typeof c.len === 'number' ? c.len : 0,
      freq: typeof c.freq === 'number' ? c.freq : undefined,
    }));
  return { shortName, calls, attribution: 'Audio via OpenMHz' };
}

