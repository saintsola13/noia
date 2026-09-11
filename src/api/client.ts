import type {
  Aircraft,
  CadResponse,
  GeoResult,
  OpenMhzCallsResponse,
  OpenMhzSystemsResponse,
  RadarMeta,
  ScannerLinks,
  AlertsResponse,
} from '../lib/types';
import {
  pickOpenMhzSystems,
  normalizeStateCode,
  type RawOpenMhzSystem,
} from '../lib/openmhzMatch';

function proxyOpenMhzAudioUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (!/^media\d*\.openmhz\.com$/i.test(u.hostname)) return rawUrl;
    if (!u.pathname.startsWith('/media/')) return rawUrl;
    return `/api/openmhz-audio?u=${encodeURIComponent(u.toString())}`;
  } catch {
    return rawUrl;
  }
}

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

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
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

async function loadSystemsCatalog(): Promise<{
  systems: RawOpenMhzSystem[];
  fromCache: boolean;
}> {
  // OpenMHz API sends illegal CORS (* + credentials), so browsers get Failed to fetch.
  // Always use our same-origin snapshot first.
  const cacheRes = await fetch('/openmhz-systems-cache.json', {
    headers: { Accept: 'application/json' },
  });
  if (!cacheRes.ok) {
    throw new Error(
      'COMMS load failed — catalog missing. Hard-refresh or retry.',
    );
  }
  const cached = (await cacheRes.json()) as { systems?: RawOpenMhzSystem[] };
  if (!cached.systems?.length) {
    throw new Error('COMMS load failed — catalog empty. Retry later.');
  }
  return { systems: cached.systems, fromCache: true };
}

/** Place from /api/scanners; catalog from same-origin OpenMHz snapshot (browser CORS broken). */
export async function fetchOpenMhzSystems(
  lat: number,
  lon: number,
): Promise<OpenMhzSystemsResponse> {
  const place = await fetchScanners(lat, lon);
  const stateCode = normalizeStateCode(place.stateCode || place.state);
  if (!stateCode) throw new Error('Could not resolve US state for OpenMHz');

  const { systems: raw, fromCache } = await loadSystemsCatalog();
  const systems = pickOpenMhzSystems(raw, {
    stateCode,
    city: place.city,
    county: place.county,
  });
  return {
    systems,
    locationLabel: place.locationLabel,
    attribution: fromCache
      ? 'Audio via OpenMHz (catalog: local cache fallback)'
      : 'Audio via OpenMHz',
  };
}

function mapOpenMhzCalls(
  shortName: string,
  raw: {
    calls?: {
      _id?: string;
      id?: string;
      talkgroupNum?: number;
      url?: string;
      time?: string;
      len?: number;
      freq?: number;
    }[];
    attribution?: string;
  },
): OpenMhzCallsResponse {
  const calls = (raw.calls || [])
    .filter((c) => c && c.url)
    .map((c) => ({
      id: String(c._id || c.id || `${c.talkgroupNum}-${c.time}`),
      talkgroupNum: Number(c.talkgroupNum) || 0,
      url: proxyOpenMhzAudioUrl(String(c.url)),
      time: c.time || '',
      len: typeof c.len === 'number' ? c.len : 0,
      freq: typeof c.freq === 'number' ? c.freq : undefined,
    }));
  return {
    shortName,
    calls,
    attribution: raw.attribution || 'Audio via OpenMHz',
  };
}

/** Same-origin only — browser cannot read api.openmhz.com (broken CORS). */
export async function fetchOpenMhzCalls(shortName: string): Promise<OpenMhzCallsResponse> {
  if (!/^[a-z0-9_-]+$/i.test(shortName)) {
    throw new Error('Invalid OpenMHz system id');
  }

  try {
    const data = await getJson<{
      calls?: {
        _id?: string;
        id?: string;
        talkgroupNum?: number;
        url?: string;
        time?: string;
        len?: number;
        freq?: number;
      }[];
      attribution?: string;
    }>(`/api/openmhz-calls?system=${encodeURIComponent(shortName)}`);
    return mapOpenMhzCalls(shortName, data);
  } catch (apiErr) {
    try {
      const cached = await getJson<{
        calls?: {
          _id?: string;
          id?: string;
          talkgroupNum?: number;
          url?: string;
          time?: string;
          len?: number;
          freq?: number;
        }[];
        attribution?: string;
      }>(`/openmhz-calls-cache/${encodeURIComponent(shortName)}.json`);
      return mapOpenMhzCalls(shortName, {
        ...cached,
        attribution: cached.attribution || 'Audio via OpenMHz (cached snapshot)',
      });
    } catch {
      if (isNetworkFailure(apiErr)) {
        throw new Error(
          'COMMS calls failed — OpenMHz unreachable. Retry or check network.',
        );
      }
      throw apiErr instanceof Error
        ? apiErr
        : new Error('COMMS calls failed — OpenMHz unreachable. Retry or check network.');
    }
  }
}

export function fetchCad(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<CadResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radiusKm: String(radiusKm),
  });
  return getJson(`/api/cad?${params}`);
}

export function fetchAlerts(lat: number, lon: number): Promise<AlertsResponse> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return getJson(`/api/alerts?${params}`);
}
