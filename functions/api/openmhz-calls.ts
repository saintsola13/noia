import { errorJson, json, UA } from './_shared';

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
    const system = (url.searchParams.get('system') || url.searchParams.get('shortName') || '').trim();
    if (!/^[a-z0-9_-]+$/i.test(system)) {
      return errorJson('system query param required (e.g. hcsc)');
    }

    try {
      const upstream = await fetch(`https://api.openmhz.com/${encodeURIComponent(system)}/calls`, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; NoiaOps/1.0; +https://github.com/saintsola13/noia)',
        },
      });
      if (upstream.ok) {
        const data = (await upstream.json()) as { calls?: unknown[] };
        return json(
          {
            shortName: system,
            calls: data.calls || [],
            attribution: 'Audio via OpenMHz',
            source: 'live',
          },
          200,
          15,
        );
      }
    } catch {
      // fall through to static cache
    }

    // Same-origin static cache (populated at deploy time)
    const cacheUrl = new URL(`/openmhz-calls-cache/${encodeURIComponent(system)}.json`, url.origin);
    const cached = await fetch(cacheUrl.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (cached.ok) {
      const data = await cached.json();
      return json(
        {
          ...data,
          shortName: system,
          attribution: 'Audio via OpenMHz (cached snapshot)',
          source: 'cache',
        },
        200,
        30,
      );
    }

    return errorJson(
      'OpenMHz calls unavailable from this host and no cache for that system',
      502,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz calls failed';
    return errorJson(message, 502);
  }
};
