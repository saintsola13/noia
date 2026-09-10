import { errorJson, json, UA } from './_shared';

const CHP_URL = 'https://media.chp.ca.gov/sa_xml/sa.xml';
const FL511_MAP_BASE = 'https://fl511.com/map/mapIcons';
const FL511_LIST_BASE = 'https://fl511.com/List/GetData';
const CACHE_TTL_MS = 75_000;
const DEFAULT_RADIUS_KM = 40;
const MAX_RADIUS_KM = 200;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Rough CA bbox for CHP routing (lat 32–42.5, lon -124.5 to -114). */
const CA_BBOX = { latMin: 32, latMax: 42.5, lonMin: -124.5, lonMax: -114 };
/** Rough FL bbox for FL511 (lat 24.4–31.1, lon -87.7 to -79.9). */
const FL_BBOX = { latMin: 24.4, latMax: 31.1, lonMin: -87.7, lonMax: -79.9 };

const FL511_LAYERS = [
  { mapPath: 'Incidents', listPath: 'incidents', label: 'Incident' },
  { mapPath: 'Construction', listPath: 'construction', label: 'Construction' },
  { mapPath: 'Closures', listPath: 'closures', label: 'Closure' },
  { mapPath: 'DisabledVehicles', listPath: 'disabledvehicles', label: 'Disabled Vehicle' },
] as const;

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

let chpCache: CacheEntry | null = null;
let fl511Cache: CacheEntry | null = null;

type Region = 'ca' | 'fl' | 'other';

function regionFor(lat: number, lon: number): Region {
  if (
    lat >= CA_BBOX.latMin &&
    lat <= CA_BBOX.latMax &&
    lon >= CA_BBOX.lonMin &&
    lon <= CA_BBOX.lonMax
  ) {
    return 'ca';
  }
  if (
    lat >= FL_BBOX.latMin &&
    lat <= FL_BBOX.latMax &&
    lon >= FL_BBOX.lonMin &&
    lon <= FL_BBOX.lonMax
  ) {
    return 'fl';
  }
  return 'other';
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** Strip simple HTML tags / entity noise from FL511 description fields. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(div|span|p|i|b|strong|em|ul|ol|li|a)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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

async function getChpIncidents(): Promise<CadIncident[]> {
  const now = Date.now();
  if (chpCache && now - chpCache.fetchedAt < CACHE_TTL_MS) {
    return chpCache.incidents;
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
  chpCache = { fetchedAt: now, incidents };
  return incidents;
}

interface FlMapIcon {
  itemId?: string | number;
  location?: [number, number] | number[];
}

interface FlListRow {
  id?: string | number;
  DT_RowId?: string;
  type?: string;
  layerName?: string;
  roadwayName?: string;
  description?: string;
  severity?: string;
  county?: string;
  direction?: string;
  laneDescription?: string;
  lastUpdated?: string;
  startDate?: string;
  isFullClosure?: boolean;
  eventSubType?: string;
}

function flIncidentType(row: FlListRow, layerLabel: string): string {
  const severity = (row.severity || '').trim();
  const layer = (row.type || row.layerName || layerLabel || 'Incident').trim();
  // Prefer "Minor Crash"-style when description looks like a crash/incident layer
  const desc = (row.description || '').toLowerCase();
  let kind = layer;
  if (/incident/i.test(layer) || layerLabel === 'Incident') {
    if (desc.includes('crash') || desc.includes('collision')) kind = 'Crash';
    else if (desc.includes('disabled')) kind = 'Disabled Vehicle';
    else kind = 'Incident';
  } else if (/construction/i.test(layer)) {
    kind = 'Construction';
  } else if (/closure/i.test(layer)) {
    kind = 'Closure';
  } else if (/disabled/i.test(layer)) {
    kind = 'Disabled Vehicle';
  }
  if (severity && severity !== 'N/A') return `${severity} ${kind}`;
  return kind;
}

function mapFlRow(
  row: FlListRow,
  lat: number,
  lon: number,
  layerLabel: string,
): CadIncident {
  const id = String(row.id ?? row.DT_RowId ?? `${layerLabel}-${lat},${lon}`);
  const details: string[] = [];
  if (row.laneDescription) details.push(String(row.laneDescription));
  if (row.direction) details.push(`Direction: ${row.direction}`);
  if (row.severity && row.severity !== 'N/A') details.push(`Severity: ${row.severity}`);
  if (row.isFullClosure) details.push('Full closure');

  return {
    id: `fl511-${id}`,
    type: flIncidentType(row, layerLabel),
    location: (row.roadwayName || '').trim() || 'Unknown roadway',
    locationDesc: stripHtml(row.description || ''),
    area: (row.county || '').trim(),
    lat,
    lon,
    logTime: (row.lastUpdated || row.startDate || '').trim(),
    details,
    units: [],
  };
}

async function fetchFlMapIcons(mapPath: string): Promise<FlMapIcon[]> {
  const res = await fetch(`${FL511_MAP_BASE}/${mapPath}`, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://fl511.com/list/events/traffic',
    },
  });
  if (!res.ok) throw new Error(`FL511 mapIcons/${mapPath} error (${res.status})`);
  const data = (await res.json()) as { item2?: FlMapIcon[] };
  return Array.isArray(data.item2) ? data.item2 : [];
}

async function fetchFlList(listPath: string): Promise<FlListRow[]> {
  const res = await fetch(`${FL511_LIST_BASE}/${listPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://fl511.com/list/events/traffic',
      'User-Agent': BROWSER_UA,
      Accept: 'application/json, text/javascript, */*',
    },
    body: 'draw=1&start=0&length=200',
  });
  if (!res.ok) throw new Error(`FL511 List/GetData/${listPath} error (${res.status})`);
  const data = (await res.json()) as { data?: FlListRow[] };
  return Array.isArray(data.data) ? data.data : [];
}

async function fetchFlLayer(
  mapPath: string,
  listPath: string,
  layerLabel: string,
): Promise<CadIncident[]> {
  const [icons, rows] = await Promise.all([
    fetchFlMapIcons(mapPath),
    fetchFlList(listPath),
  ]);
  const byId = new Map<string, FlListRow>();
  for (const row of rows) {
    const key = String(row.id ?? row.DT_RowId ?? '');
    if (key) byId.set(key, row);
  }

  const out: CadIncident[] = [];
  for (const icon of icons) {
    const itemId = String(icon.itemId ?? '');
    if (!itemId) continue;
    const loc = icon.location;
    if (!Array.isArray(loc) || loc.length < 2) continue;
    const lat = Number(loc[0]);
    const lon = Number(loc[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const row = byId.get(itemId);
    if (row) {
      out.push(mapFlRow(row, lat, lon, layerLabel));
    } else {
      // Map pin without list row — still show a minimal incident
      out.push({
        id: `fl511-${itemId}`,
        type: layerLabel,
        location: 'Unknown roadway',
        locationDesc: '',
        area: '',
        lat,
        lon,
        logTime: '',
        details: [],
        units: [],
      });
    }
  }
  return out;
}

async function getFl511Incidents(): Promise<CadIncident[]> {
  const now = Date.now();
  if (fl511Cache && now - fl511Cache.fetchedAt < CACHE_TTL_MS) {
    return fl511Cache.incidents;
  }
  const batches = await Promise.all(
    FL511_LAYERS.map((layer) =>
      fetchFlLayer(layer.mapPath, layer.listPath, layer.label).catch((err) => {
        console.error(`FL511 layer ${layer.mapPath} failed:`, err);
        return [] as CadIncident[];
      }),
    ),
  );
  const incidents = batches.flat();
  // Deduplicate by id (same event shouldn't appear twice)
  const seen = new Set<string>();
  const unique: CadIncident[] = [];
  for (const inc of incidents) {
    if (seen.has(inc.id)) continue;
    seen.add(inc.id);
    unique.push(inc);
  }
  fl511Cache = { fetchedAt: now, incidents: unique };
  return unique;
}

function filterByRadius(
  all: CadIncident[],
  lat: number,
  lon: number,
  radiusKm: number,
): CadIncident[] {
  return all
    .map((inc) => ({
      inc,
      dist: haversineKm(lat, lon, inc.lat, inc.lon),
    }))
    .filter((row) => row.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map((row) => row.inc);
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

    const region = regionFor(lat, lon);

    if (region === 'other') {
      return json(
        {
          source: 'none',
          notice:
            'CAD currently supports California (CHP public sa.xml) and Florida (FL511 / FDOT traffic incidents). Other states have no feed yet — city 911 CAD is not included.',
          count: 0,
          incidents: [],
        },
        200,
        45,
      );
    }

    if (region === 'ca') {
      const all = await getChpIncidents();
      const incidents = filterByRadius(all, lat, lon, radiusKm);
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
    }

    // Florida — FL511
    const all = await getFl511Incidents();
    const incidents = filterByRadius(all, lat, lon, radiusKm);
    return json(
      {
        source: 'FL511 / FDOT (public traffic incidents)',
        notice:
          'FL511 / FDOT public traffic incidents — crashes, closures, construction, disabled vehicles. Not city 911 CAD.',
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
