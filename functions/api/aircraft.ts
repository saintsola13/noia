import { errorJson, json } from './_shared';

/** OpenSky / adsb.* block Cloudflare egress. Netlify function proxies ADS-B. */
const UPSTREAM = 'https://noia-aircraft.netlify.app/api/aircraft';

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
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    const radiusKm = url.searchParams.get('radiusKm') ?? '40';
    if (!lat || !lon) return errorJson('lat and lon are required numbers');

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('lat', lat);
    upstream.searchParams.set('lon', lon);
    upstream.searchParams.set('radiusKm', radiusKm);

    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'NoiaOps/1.0 (Cloudflare Pages)' },
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return errorJson('Upstream returned non-JSON', 502);
    }
    if (!res.ok) {
      const err = (data as { error?: string })?.error || `Upstream error (${res.status})`;
      return errorJson(err, res.status === 429 ? 429 : 502);
    }
    return json(data, 200, 5);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Aircraft fetch failed';
    return errorJson(message, 502);
  }
};
