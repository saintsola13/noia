/**
 * Local Vite middleware mirroring Cloudflare Pages Functions in functions/api/.
 * Used only during `npm run dev` so the SPA can call /api/* without wrangler.
 */

const UA = 'NoiaOps/1.0 (contact: saintsola13)';


const STATE_NAME_TO_CODE = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function normalizeStateCode(input) {
  if (!input) return undefined;
  const trimmed = String(input).trim();
  if (!trimmed) return undefined;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()];
}

function stateMatches(systemState, targetCode) {
  const code = normalizeStateCode(systemState);
  return Boolean(code && code === targetCode);
}

let openMhzSystemsCache = null;
const OPENMHZ_SYSTEMS_TTL_MS = 60 * 60 * 1000;

async function getOpenMhzSystems() {
  const now = Date.now();
  if (openMhzSystemsCache && now - openMhzSystemsCache.fetchedAt < OPENMHZ_SYSTEMS_TTL_MS) {
    return openMhzSystemsCache.systems;
  }
  const res = await fetch('https://api.openmhz.com/systems', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenMHz systems error (${res.status})`);
  const data = await res.json();
  const systems = Array.isArray(data.systems) ? data.systems : [];
  openMhzSystemsCache = { fetchedAt: now, systems };
  return systems;
}

function scoreOpenMhzSystem(sys, opts) {
  const city = opts.city?.toLowerCase().trim();
  const county = opts.county?.replace(/\s+County$/i, '').toLowerCase().trim();
  const name = (sys.name || '').toLowerCase();
  const desc = (sys.description || '').toLowerCase();
  const sysCity = (sys.city || '').toLowerCase();
  const sysCounty = (sys.county || '').toLowerCase();
  const hay = `${name} ${desc} ${sysCity} ${sysCounty}`;
  let score = 0;
  if (city) {
    if (sysCity && (sysCity.includes(city) || city.includes(sysCity))) score += 1000;
    else if (hay.includes(city)) score += 800;
  }
  if (county) {
    if (sysCounty.includes(county) || hay.includes(county)) score += 400;
    if (hay.includes(`${county} county`)) score += 100;
  }
  if (sys.active) score += 50;
  score += Math.min(40, Number(sys.callAvg) || 0);
  return score;
}


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
        if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 250) {
          return sendJson(res, { error: 'radiusKm must be between 0 and 250' }, 400);
        }
        const distNm = Math.max(1, Math.min(250, radiusKm / 1.852)).toFixed(1);
        const urls = [
          `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${distNm}`,
          `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${distNm}`,
        ];
        let data = null;
        let source = 'adsb.lol';
        let lastErr = 'ADS-B upstream unavailable';
        for (const u of urls) {
          try {
            const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': UA } });
            if (!r.ok) { lastErr = `ADS-B error (${r.status})`; continue; }
            data = await r.json();
            source = u.includes('adsb.lol') ? 'adsb.lol' : 'adsb.fi';
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : 'ADS-B fetch failed';
          }
        }
        if (!data) return sendJson(res, { error: lastErr }, 502);
        const list = data.ac ?? data.aircraft ?? [];
        const aircraft = list
          .map((a) => {
            if (a.lat == null || a.lon == null) return null;
            const baro = typeof a.alt_baro === 'number' ? a.alt_baro : null;
            return {
              icao24: String(a.hex ?? '').toLowerCase(),
              callsign: String(a.flight ?? a.r ?? '').trim() || 'N/A',
              originCountry: a.desc || a.t || a.category || '',
              lon: a.lon,
              lat: a.lat,
              baroAltitude: baro != null ? baro * 0.3048 : null,
              geoAltitude: a.alt_geom != null ? a.alt_geom * 0.3048 : null,
              velocity: a.gs != null ? a.gs * 0.514444 : null,
              heading: a.track ?? null,
              verticalRate: a.baro_rate != null ? a.baro_rate * 0.00508 : null,
              onGround: typeof a.alt_baro === 'string' && String(a.alt_baro).toLowerCase() === 'ground',
              squawk: a.squawk != null ? String(a.squawk) : null,
            };
          })
          .filter(Boolean);
        return sendJson(res, {
          time: data.now ?? Math.floor(Date.now() / 1000),
          count: aircraft.length,
          radiusKm,
          source: `${source} ADS-B (civilian)`,
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
            'External catalog links only (Broadcastify / RadioReference) — NOIA does not embed or proxy those streams. In-app call bursts come from OpenMHz separately. Availability and legality of listening vary by jurisdiction — follow local law and each site’s terms.',
        });
      }


      // --- OpenMHz systems (1h memory cache) ---
      if (url.pathname === '/api/openmhz-systems') {
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        let stateParam = url.searchParams.get('state')?.trim() || undefined;
        let cityParam = url.searchParams.get('city')?.trim() || undefined;
        let county;
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
          return sendJson(res, { error: 'Provide lat & lon, or state (& optional city)' }, 400);
        }

        const stateCode = normalizeStateCode(stateParam);
        if (!stateCode) {
          return sendJson(res, { error: 'Could not resolve a US state for this location' }, 404);
        }

        const all = await getOpenMhzSystems();
        const inState = all.filter((s) => s.shortName && stateMatches(s.state, stateCode));
        const scored = inState
          .map((s) => ({
            sys: s,
            score: scoreOpenMhzSystem(s, { city: cityParam, county, stateCode }),
          }))
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const aActive = a.sys.active ? 1 : 0;
            const bActive = b.sys.active ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;
            return (Number(b.sys.callAvg) || 0) - (Number(a.sys.callAvg) || 0);
          });

        const top = scored.slice(0, 8).map(({ sys }) => ({
          shortName: String(sys.shortName),
          name: sys.name || String(sys.shortName),
          city: sys.city || sys.county || undefined,
          state: normalizeStateCode(sys.state) || sys.state || stateCode,
          active: Boolean(sys.active),
          callAvg: Number(sys.callAvg) || 0,
          lastActive: sys.lastActive || undefined,
        }));

        if (!locationLabel) {
          locationLabel = cityParam ? `${cityParam}, ${stateCode}` : stateCode;
        }

        res.setHeader('Cache-Control', 'public, max-age=300');
        return sendJson(res, {
          systems: top,
          locationLabel,
          attribution: 'Audio via OpenMHz',
        });
      }

      if (url.pathname === '/api/openmhz-calls') {
        const shortName = url.searchParams.get('shortName')?.trim() || '';
        if (!shortName || !/^[a-z0-9_-]+$/i.test(shortName)) {
          return sendJson(res, { error: 'shortName is required and must match /^[a-z0-9_-]+$/i' }, 400);
        }
        const cRes = await fetch(`https://api.openmhz.com/${encodeURIComponent(shortName)}/calls`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        });
        if (!cRes.ok) return sendJson(res, { error: `OpenMHz calls error (${cRes.status})` }, 502);
        const data = await cRes.json();
        const calls = (Array.isArray(data.calls) ? data.calls : [])
          .filter((c) => c && c.url)
          .map((c) => ({
            id: String(c._id || c.id || `${c.talkgroupNum}-${c.time}`),
            talkgroupNum: Number(c.talkgroupNum) || 0,
            url: String(c.url),
            time: c.time || '',
            len: typeof c.len === 'number' ? c.len : 0,
            freq: typeof c.freq === 'number' ? c.freq : undefined,
          }));
        res.setHeader('Cache-Control', 'public, max-age=15');
        return sendJson(res, {
          shortName,
          calls,
          attribution: 'Audio via OpenMHz',
        });
      }

      return sendJson(res, { error: 'Not found' }, 404);
    } catch (err) {
      return sendJson(res, { error: err instanceof Error ? err.message : 'API error' }, 502);
    }
  };
}
