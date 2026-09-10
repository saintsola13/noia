export const UA = 'NoiaOps/1.0 (contact: saintsola13)';

export function corsHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

export function json(data: unknown, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, status);
}

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

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    city_district?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
}

export function mapNominatim(item: NominatimResult) {
  const a = item.address ?? {};
  const stateCode = a['ISO3166-2-lvl4']?.includes('-')
    ? a['ISO3166-2-lvl4'].split('-')[1]
    : undefined;
  const county = a.county || a.city_district || undefined;
  return {
    lat: Number(item.lat),
    lon: Number(item.lon),
    displayName: item.display_name,
    city: a.city || a.town || a.village || a.hamlet || a.municipality,
    county,
    state: a.state,
    stateCode,
    country: a.country,
    postcode: a.postcode,
  };
}

export async function nominatimSearch(q: string): Promise<NominatimResult[]> {
  const trimmed = q.trim();
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    limit: '1',
  });
  if (isUsZip(trimmed)) {
    params.set('postalcode', trimmed);
    params.set('countrycodes', 'us');
  } else {
    params.set('q', trimmed);
  }
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim search failed (${res.status})`);
  return (await res.json()) as NominatimResult[];
}

export async function nominatimReverse(lat: number, lon: number): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    format: 'json',
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
    zoom: '10',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
  const data = (await res.json()) as NominatimResult & { error?: string };
  if (data.error) return null;
  return data;
}
