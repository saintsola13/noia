import { errorJson, json } from './_shared';

/**
 * Browser cannot call api.openmhz.com (illegal CORS). Client uses
 * /openmhz-systems-cache.json. This endpoint exists for debugging / future use.
 */
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
    const cacheUrl = new URL('/openmhz-systems-cache.json', url.origin);
    const res = await fetch(cacheUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) return errorJson('systems cache missing', 502);
    const data = await res.json();
    return json(
      {
        ...(typeof data === 'object' && data ? data : {}),
        notice:
          'Served from deploy snapshot — OpenMHz live API is not browser-CORS safe and CF egress is often blocked.',
      },
      200,
      300,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz systems lookup failed';
    return errorJson(message, 502);
  }
};
