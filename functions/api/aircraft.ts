import { errorJson, json } from './_shared';

type AdsbAc = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  lat?: number;
  lon?: number;
  squawk?: string;
  category?: string;
  desc?: string;
};

function kmToNm(km: number) {
  return Math.max(1, Math.min(250, km / 1.852));
}

function parseAlt(v: number | string | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // "ground" etc.
  return null;
}

function mapAc(a: AdsbAc) {
  if (a.lat == null || a.lon == null) return null;
  const callsign = String(a.flight ?? a.r ?? '').trim() || 'N/A';
  const baro = parseAlt(a.alt_baro);
  return {
    icao24: String(a.hex ?? '').toLowerCase(),
    callsign,
    originCountry: a.desc || a.t || a.category || '',
    lon: a.lon,
    lat: a.lat,
    baroAltitude: baro != null ? baro * 0.3048 : null, // feet → meters (UI expects m like OpenSky)
    geoAltitude: a.alt_geom != null ? a.alt_geom * 0.3048 : null,
    velocity: a.gs != null ? a.gs * 0.514444 : null, // knots → m/s
    heading: a.track ?? null,
    verticalRate: a.baro_rate != null ? a.baro_rate * 0.00508 : null, // fpm → m/s
    onGround: typeof a.alt_baro === 'string' && a.alt_baro.toLowerCase() === 'ground',
    squawk: a.squawk != null ? String(a.squawk) : null,
  };
}

async function fetchAdsb(lat: number, lon: number, radiusKm: number) {
  const distNm = kmToNm(radiusKm).toFixed(1);
  const urls = [
    `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${distNm}`,
    `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${distNm}`,
  ];
  let lastErr = 'ADS-B upstream unavailable';
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NoiaOps/1.0 (contact: saintsola13)',
        },
      });
      if (res.status === 429) {
        lastErr = 'ADS-B rate limited — retry shortly';
        continue;
      }
      if (!res.ok) {
        lastErr = `ADS-B error (${res.status})`;
        continue;
      }
      const data = (await res.json()) as {
        ac?: AdsbAc[];
        aircraft?: AdsbAc[];
        now?: number;
        total?: number;
      };
      const list = data.ac ?? data.aircraft ?? [];
      return {
        list,
        source: url.includes('adsb.lol') ? 'adsb.lol' : 'adsb.fi',
        now: data.now ?? null,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'ADS-B fetch failed';
    }
  }
  throw new Error(lastErr);
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
    const radiusKm = Number(url.searchParams.get('radiusKm') ?? '40');

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return errorJson('lat and lon are required numbers');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 250) {
      return errorJson('radiusKm must be between 0 and 250');
    }

    const { list, source, now } = await fetchAdsb(lat, lon, radiusKm);
    const aircraft = list.map(mapAc).filter((a): a is NonNullable<typeof a> => a != null);

    return json(
      {
        time: now ?? Math.floor(Date.now() / 1000),
        count: aircraft.length,
        radiusKm,
        source: `${source} ADS-B (civilian)`,
        notice: 'ADS-B only — not military radar',
        aircraft,
      },
      200,
      5,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Aircraft fetch failed';
    const status = message.includes('rate limited') ? 429 : 502;
    return errorJson(message, status);
  }
};
