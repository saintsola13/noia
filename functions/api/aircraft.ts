import { errorJson, json, radiusToBbox } from './_shared';

type OpenSkyState = (string | number | boolean | null)[];

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
    const radiusKm = Number(url.searchParams.get('radiusKm') ?? '40');

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return errorJson('lat and lon are required numbers');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 250) {
      return errorJson('radiusKm must be between 0 and 250');
    }

    const bbox = radiusToBbox(lat, lon, radiusKm);
    const params = new URLSearchParams({
      lamin: String(bbox.lamin),
      lomin: String(bbox.lomin),
      lamax: String(bbox.lamax),
      lomax: String(bbox.lomax),
    });

    const osUrl = `https://opensky-network.org/api/states/all?${params}`;
    const res = await fetch(osUrl, {
      headers: { Accept: 'application/json' },
    });

    if (res.status === 429) {
      return errorJson('OpenSky rate limited — retry shortly', 429);
    }
    if (!res.ok) {
      return errorJson(`OpenSky error (${res.status})`, 502);
    }

    const data = (await res.json()) as { time?: number; states?: OpenSkyState[] | null };
    const states = data.states ?? [];

    const aircraft = states
      .map((s) => {
        const lonV = s[5] as number | null;
        const latV = s[6] as number | null;
        if (lonV == null || latV == null) return null;
        return {
          icao24: String(s[0] ?? ''),
          callsign: String(s[1] ?? '').trim() || 'N/A',
          originCountry: String(s[2] ?? ''),
          lon: lonV,
          lat: latV,
          baroAltitude: (s[7] as number | null) ?? null,
          geoAltitude: (s[13] as number | null) ?? null,
          velocity: (s[9] as number | null) ?? null,
          heading: (s[10] as number | null) ?? null,
          verticalRate: (s[11] as number | null) ?? null,
          onGround: Boolean(s[8]),
          squawk: s[14] != null ? String(s[14]) : null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a != null);

    return json(
      {
        time: data.time ?? null,
        count: aircraft.length,
        bbox,
        source: 'OpenSky Network ADS-B (civilian)',
        notice: 'ADS-B only — not military radar',
        aircraft,
      },
      200,
      8,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Aircraft fetch failed';
    return errorJson(message, 502);
  }
};
