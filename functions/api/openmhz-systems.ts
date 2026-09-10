import {
  UA,
  errorJson,
  json,
  mapNominatim,
  nominatimReverse,
} from './_shared';

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);

interface OpenMhzRawSystem {
  name?: string;
  shortName?: string;
  city?: string;
  county?: string;
  state?: string;
  active?: boolean;
  callAvg?: number;
  lastActive?: string;
  description?: string;
}

interface CachedSystems {
  fetchedAt: number;
  systems: OpenMhzRawSystem[];
}

let systemsCache: CachedSystems | null = null;
const SYSTEMS_TTL_MS = 60 * 60 * 1000;

function normalizeStateCode(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()];
}

function stateMatches(systemState: string | undefined, targetCode: string): boolean {
  const code = normalizeStateCode(systemState);
  if (!code) return false;
  return code === targetCode;
}

async function getSystems(): Promise<OpenMhzRawSystem[]> {
  const now = Date.now();
  if (systemsCache && now - systemsCache.fetchedAt < SYSTEMS_TTL_MS) {
    return systemsCache.systems;
  }
  const res = await fetch('https://api.openmhz.com/systems', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenMHz systems error (${res.status})`);
  const data = (await res.json()) as { systems?: OpenMhzRawSystem[] };
  const systems = Array.isArray(data.systems) ? data.systems : [];
  systemsCache = { fetchedAt: now, systems };
  return systems;
}

function scoreSystem(
  sys: OpenMhzRawSystem,
  opts: { city?: string; county?: string; stateCode: string },
): number {
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

    const stateCode = normalizeStateCode(stateParam);
    if (!stateCode) {
      return errorJson('Could not resolve a US state for this location', 404);
    }

    const all = await getSystems();
    const inState = all.filter(
      (s) => s.shortName && stateMatches(s.state, stateCode),
    );

    const scored = inState
      .map((s) => ({
        sys: s,
        score: scoreSystem(s, { city: cityParam, county, stateCode }),
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
      const stateName = CODE_TO_NAME[stateCode];
      locationLabel = cityParam
        ? `${cityParam}, ${stateCode}`
        : stateName
          ? `${stateName} (${stateCode})`
          : stateCode;
    }

    return json(
      {
        systems: top,
        locationLabel,
        attribution: 'Audio via OpenMHz',
      },
      200,
      300,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz systems lookup failed';
    return errorJson(message, 502);
  }
};
