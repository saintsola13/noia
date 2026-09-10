import { errorJson, json, mapNominatim, nominatimReverse } from './_shared';

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

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return errorJson('lat and lon are required numbers');
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

    const links: {
      label: string;
      url: string;
      source: 'broadcastify' | 'radioreference' | 'other';
    }[] = [
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
        url: `https://www.broadcastify.com/listen/stid`,
        source: 'broadcastify',
      });
      links.push({
        label: `RadioReference — USDB state index`,
        url: `https://www.radioreference.com/db/browse/`,
        source: 'radioreference',
      });
    }

    return json(
      {
        lat,
        lon,
        locationLabel,
        city,
        county: mapped?.county,
        state,
        stateCode,
        links,
        disclaimer:
          'External catalog links only (Broadcastify / RadioReference) — NOIA does not embed or proxy those streams. In-app call bursts come from OpenMHz separately. Availability and legality of listening vary by jurisdiction — follow local law and each site’s terms.',
      },
      200,
      300,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scanner lookup failed';
    return errorJson(message, 502);
  }
};
