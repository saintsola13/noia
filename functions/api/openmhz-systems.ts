import { errorJson, json, mapNominatim, nominatimReverse } from './_shared';

const UPSTREAM = 'https://noia-aircraft.netlify.app/api/openmhz-systems';

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
    let stateParam = url.searchParams.get('state')?.trim() || undefined;
    let cityParam = url.searchParams.get('city')?.trim() || undefined;
    let county: string | undefined;
    let locationLabel = '';

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const rev = await nominatimReverse(lat, lon);
      const mapped = rev ? mapNominatim(rev) : null;
      cityParam = cityParam || mapped?.city;
      county = mapped?.county;
      stateParam = stateParam || mapped?.stateCode || mapped?.state;
      const countyDisplay = county
        ? /county$/i.test(county)
          ? county
          : `${county} County`
        : undefined;
      locationLabel =
        [cityParam, countyDisplay, mapped?.state || mapped?.stateCode]
          .filter(Boolean)
          .join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else if (stateParam || cityParam) {
      locationLabel = [cityParam, stateParam].filter(Boolean).join(', ');
    } else {
      return errorJson('Provide lat & lon, or state (& optional city)');
    }

    if (!stateParam) {
      return errorJson('Could not resolve a US state for this location', 404);
    }

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('state', stateParam);
    if (cityParam) upstream.searchParams.set('city', cityParam);
    if (county) upstream.searchParams.set('county', county);
    if (locationLabel) upstream.searchParams.set('locationLabel', locationLabel);

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
      return errorJson(err, 502);
    }
    return json(data, 200, 300);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz systems lookup failed';
    return errorJson(message, 502);
  }
};
