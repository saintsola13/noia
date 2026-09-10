import { errorJson, json, UA } from './_shared';

const CHP_URL = 'https://media.chp.ca.gov/sa_xml/sa.xml';
const CACHE_TTL_MS = 75_000;
const DEFAULT_RADIUS_KM = 40;
const MAX_RADIUS_KM = 150;

export interface CadIncident {
  id: string;
  type: string;
  location: string;
  locationDesc: string;
  area: string;
  lat: number;
  lon: number;
  logTime: string;
  details: string[];
  units: string[];
}

interface CacheEntry {
  fetchedAt: number;
  incidents: CadIncident[];
}

let cache: CacheEntry | null = null;

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? stripQuotes(m[1]) : '';
}

function parseLatLon(raw: string): { lat: number; lon: number } | null {
  const cleaned = stripQuotes(raw).trim();
  if (!cleaned || cleaned === '0:0') return null;
  const parts = cleaned.split(':');
  if (parts.length !== 2) return null;
  const latRaw = Number(parts[0]);
  const lonRaw = Number(parts[1]);
  if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) return null;
  if (latRaw === 0 && lonRaw === 0) return null;
  const lat = latRaw / 1e6;
  // CHP stores absolute west longitude; CA is always west → negative
  const lon = -Math.abs(lonRaw / 1e6);
  if (lat < 32 || lat > 43 || lon > -114 || lon < -125) {
    // Soft sanity for CA bounding box; still return if coords look usable
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  }
  return { lat, lon };
}

function collectTagTexts(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = stripQuotes(m[1]).trim();
    if (v) out.push(v);
  }
  return out;
}

function parseChpXml(xml: string): CadIncident[] {
  const incidents: CadIncident[] = [];
  const logRe = /<Log\s+ID\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/Log>/gi;
  let m: RegExpExecArray | null;
  while ((m = logRe.exec(xml)) !== null) {
    const id = m[1];
    const body = m[2];
    const coords = parseLatLon(tagText(body, 'LATLON'));
    if (!coords) continue;

    const details = collectTagTexts(body, 'IncidentDetail');
    const units = [...new Set(collectTagTexts(body, 'UnitDetail'))];

    incidents.push({
      id,
      type: tagText(body, 'LogType'),
      location: tagText(body, 'Location'),
      locationDesc: tagText(body, 'LocationDesc'),
      area: tagText(body, 'Area'),
      lat: coords.lat,
      lon: coords.lon,
      logTime: tagText(body, 'LogTime'),
      details,
      units,
    });
  }
  return incidents;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function getStatewideIncidents(): Promise<CadIncident[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.incidents;
  }
  const res = await fetch(CHP_URL, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`CHP sa.xml error (${res.status})`);
  const xml = await res.text();
  const incidents = parseChpXml(xml);
  cache = { fetchedAt: now, incidents };
  return incidents;
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
    let radiusKm = Number(url.searchParams.get('radiusKm') ?? String(DEFAULT_RADIUS_KM));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return errorJson('lat and lon are required numbers');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return errorJson('radiusKm must be a positive number');
    }
    radiusKm = Math.min(MAX_RADIUS_KM, radiusKm);

    const all = await getStatewideIncidents();
    const withDist = all
      .map((inc) => ({
        inc,
        dist: haversineKm(lat, lon, inc.lat, inc.lon),
      }))
      .filter((row) => row.dist <= radiusKm)
      .sort((a, b) => a.dist - b.dist);
    const incidents = withDist.map((row) => row.inc);

    return json(
      {
        source: 'California Highway Patrol (public sa.xml)',
        notice:
          'CHP statewide incidents — mostly traffic/highway/public safety. City PD domestic CAD is not in this feed.',
        count: incidents.length,
        incidents,
      },
      200,
      45,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CAD fetch failed';
    return errorJson(message, 502);
  }
};
