import { errorJson, json } from './_shared';

/** NWS requires a descriptive User-Agent. */
const NWS_UA = 'NoiaOps/1.0 (github.com/saintsola13/noia; contact via GitHub)';

const CACHE_TTL_MS = 75_000;

type Severity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

type AlertGeometry =
  | { type: string; coordinates: unknown }
  | null;

interface AlertOut {
  id: string;
  event: string;
  severity: Severity;
  urgency: string;
  certainty: string;
  headline: string;
  description: string;
  instruction: string;
  areaDesc: string;
  onset: string | null;
  ends: string | null;
  sent: string | null;
  color: string;
  geometry: AlertGeometry;
}

interface CacheEntry {
  key: string;
  fetchedAt: number;
  payload: { source: string; count: number; alerts: AlertOut[] };
}

let cache: CacheEntry | null = null;

const SEVERITY_RANK: Record<string, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

function severityColor(severity: string): string {
  switch (severity) {
    case 'Extreme':
      return '#ff2d2d';
    case 'Severe':
      return '#ff5a2a';
    case 'Moderate':
      return '#ffc857';
    case 'Minor':
      return '#5ce1ff';
    default:
      return '#7a92a3';
  }
}

function normalizeSeverity(raw: unknown): Severity {
  const s = String(raw || '');
  if (s === 'Extreme' || s === 'Severe' || s === 'Moderate' || s === 'Minor') return s;
  return 'Unknown';
}

function roundCoord(n: number): string {
  return n.toFixed(3);
}

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export const onRequestGet = async (context: { request: Request }) => {
  try {
    const url = new URL(context.request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return errorJson('lat and lon are required numbers');
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return errorJson('lat/lon out of range');
    }

    const key = `${roundCoord(lat)},${roundCoord(lon)}`;
    const now = Date.now();
    if (cache && cache.key === key && now - cache.fetchedAt < CACHE_TTL_MS) {
      return json(cache.payload, 200, 60);
    }

    const nwsUrl = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
    const res = await fetch(nwsUrl, {
      headers: {
        'User-Agent': NWS_UA,
        Accept: 'application/geo+json',
      },
    });
    if (!res.ok) {
      return errorJson(`NWS alerts error (${res.status})`, 502);
    }

    const data = (await res.json()) as {
      features?: {
        id?: string;
        geometry?: { type: string; coordinates: unknown } | null;
        properties?: Record<string, unknown>;
      }[];
    };

    const alerts: AlertOut[] = (data.features || []).map((f) => {
      const p = f.properties || {};
      const severity = normalizeSeverity(p.severity);
      const id =
        String(p.id || f.id || '') ||
        `${p.event || 'alert'}-${p.sent || p.onset || Math.random()}`;
      return {
        id,
        event: String(p.event || 'Weather Alert'),
        severity,
        urgency: String(p.urgency || 'Unknown'),
        certainty: String(p.certainty || 'Unknown'),
        headline: String(p.headline || p.event || 'Active weather alert'),
        description: String(p.description || ''),
        instruction: String(p.instruction || ''),
        areaDesc: String(p.areaDesc || ''),
        onset: p.onset != null ? String(p.onset) : null,
        ends: p.ends != null ? String(p.ends) : null,
        sent: p.sent != null ? String(p.sent) : null,
        color: severityColor(severity),
        geometry: f.geometry ?? null,
      };
    });

    alerts.sort((a, b) => {
      const ra = SEVERITY_RANK[a.severity] ?? 9;
      const rb = SEVERITY_RANK[b.severity] ?? 9;
      if (ra !== rb) return ra - rb;
      const ta = a.onset || a.sent || '';
      const tb = b.onset || b.sent || '';
      return tb.localeCompare(ta);
    });

    const payload = {
      source: 'National Weather Service',
      count: alerts.length,
      alerts,
    };
    cache = { key, fetchedAt: now, payload };
    return json(payload, 200, 60);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alerts fetch failed';
    return errorJson(message, 502);
  }
};
