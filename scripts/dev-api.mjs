/**
 * Local Vite middleware mirroring Cloudflare Pages Functions in functions/api/.
 * Used only during `npm run dev` so the SPA can call /api/* without wrangler.
 */

const UA = 'NoiaOps/1.0 (contact: saintsola13)';

function radiusToBbox(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    lamin: lat - latDelta,
    lamax: lat + latDelta,
    lomin: lon - lonDelta,
    lomax: lon + lonDelta,
  };
}

function isUsZip(q) {
  return /^\d{5}$/.test(q.trim());
}

function mapNominatim(item) {
  const a = item.address ?? {};
  const iso = a['ISO3166-2-lvl4'];
  const stateCode = iso?.includes('-') ? iso.split('-')[1] : undefined;
  return {
    lat: Number(item.lat),
    lon: Number(item.lon),
    displayName: item.display_name,
    city: a.city || a.town || a.village || a.hamlet || a.municipality,
    county: a.county || a.city_district,
    state: a.state,
    stateCode,
    country: a.country,
    postcode: a.postcode,
  };
}

async function nominatimSearch(q) {
  const trimmed = q.trim();
  const params = new URLSearchParams({ format: 'json', addressdetails: '1', limit: '1' });
  if (isUsZip(trimmed)) {
    params.set('postalcode', trimmed);
    params.set('countrycodes', 'us');
  } else {
    params.set('q', trimmed);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim search failed (${res.status})`);
  return res.json();
}

async function nominatimReverse(lat, lon) {
  const params = new URLSearchParams({
    format: 'json',
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
    zoom: '10',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
  const data = await res.json();
  if (data.error) return null;
  return data;
}

function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

export function createDevApiMiddleware() {
  return async function devApiMiddleware(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.end();
    }

    try {
      if (url.pathname === '/api/geocode') {
        const q = url.searchParams.get('q')?.trim();
        if (!q) return sendJson(res, { error: 'Missing q parameter' }, 400);
        const results = await nominatimSearch(q);
        if (!results.length) return sendJson(res, { error: 'Location not found' }, 404);
        return sendJson(res, mapNominatim(results[0]));
      }

      if (url.pathname === '/api/aircraft') {
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        const radiusKm = Number(url.searchParams.get('radiusKm') ?? '40');
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return sendJson(res, { error: 'lat and lon are required numbers' }, 400);
        }
        const bbox = radiusToBbox(lat, lon, radiusKm);
        const params = new URLSearchParams({
          lamin: String(bbox.lamin),
          lomin: String(bbox.lomin),
          lamax: String(bbox.lamax),
          lomax: String(bbox.lomax),
        });
        const osRes = await fetch(`https://opensky-network.org/api/states/all?${params}`, {
          headers: { Accept: 'application/json' },
        });
        if (osRes.status === 429) {
          return sendJson(res, { error: 'OpenSky rate limited — retry shortly' }, 429);
        }
        if (!osRes.ok) {
          return sendJson(res, { error: `OpenSky error (${osRes.status})` }, 502);
        }
        const data = await osRes.json();
        const states = data.states ?? [];
        const aircraft = states
          .map((s) => {
            const lonV = s[5];
            const latV = s[6];
            if (lonV == null || latV == null) return null;
            return {
              icao24: String(s[0] ?? ''),
              callsign: String(s[1] ?? '').trim() || 'N/A',
              originCountry: String(s[2] ?? ''),
              lon: lonV,
              lat: latV,
              baroAltitude: s[7] ?? null,
              geoAltitude: s[13] ?? null,
              velocity: s[9] ?? null,
              heading: s[10] ?? null,
              verticalRate: s[11] ?? null,
              onGround: Boolean(s[8]),
              squawk: s[14] != null ? String(s[14]) : null,
            };
          })
          .filter(Boolean);
        return sendJson(res, {
          time: data.time ?? null,
          count: aircraft.length,
          bbox,
          source: 'OpenSky Network ADS-B (civilian)',
          notice: 'ADS-B only — not military radar',
          aircraft,
        });
      }

      if (url.pathname === '/api/radar') {
        const rRes = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
          headers: { Accept: 'application/json' },
        });
        if (!rRes.ok) return sendJson(res, { error: `RainViewer error (${rRes.status})` }, 502);
        return sendJson(res, await rRes.json());
      }

      if (url.pathname === '/api/scanners') {
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return sendJson(res, { error: 'lat and lon are required numbers' }, 400);
        }
        const rev = await nominatimReverse(lat, lon);
        const mapped = rev ? mapNominatim(rev) : null;
        const countyRaw = mapped?.county;
        const countyShort = countyRaw?.replace(/\s+County$/i, '') || undefined;
        const state = mapped?.state;
        const stateCode = mapped?.stateCode;
        const city = mapped?.city;
        const countyDisplay = countyRaw
          ? /county$/i.test(countyRaw)
            ? countyRaw
            : `${countyRaw} County`
          : undefined;
        const locationLabel =
          [city, countyDisplay, state || stateCode].filter(Boolean).join(', ') ||
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        const queryParts = [countyDisplay || countyShort, stateCode || state]
          .filter(Boolean)
          .join(' ');
        const broadcastifyQ = encodeURIComponent(queryParts || locationLabel);
        const radioRefQ = encodeURIComponent(queryParts || locationLabel);
        const links = [
          {
            label: `Broadcastify search: ${queryParts || locationLabel}`,
            url: `https://www.broadcastify.com/search/?q=${broadcastifyQ}`,
            source: 'broadcastify',
          },
          {
            label: `RadioReference search: ${countyDisplay || locationLabel}`,
            url: `https://www.radioreference.com/db/search?keywords=${radioRefQ}`,
            source: 'radioreference',
          },
        ];
        if (stateCode) {
          links.push({
            label: `Broadcastify — browse by state (${stateCode})`,
            url: 'https://www.broadcastify.com/listen/stid',
            source: 'broadcastify',
          });
          links.push({
            label: 'RadioReference — USDB state index',
            url: 'https://www.radioreference.com/db/browse/',
            source: 'radioreference',
          });
        }
        return sendJson(res, {
          lat,
          lon,
          locationLabel,
          county: mapped?.county,
          state,
          stateCode,
          links,
          disclaimer:
            'NOIA does not embed, proxy, or stream scanner audio. Links open Broadcastify / RadioReference in a new tab. Availability and legality of listening vary by jurisdiction — follow local law and each site’s terms.',
        });
      }

      return sendJson(res, { error: 'Not found' }, 404);
    } catch (err) {
      return sendJson(res, { error: err instanceof Error ? err.message : 'API error' }, 502);
    }
  };
}
