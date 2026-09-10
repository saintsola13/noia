import { errorJson, json, mapNominatim, nominatimSearch } from './_shared';

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
    const q = url.searchParams.get('q')?.trim();
    if (!q) return errorJson('Missing q parameter');

    const results = await nominatimSearch(q);
    if (!results.length) return errorJson('Location not found', 404);

    return json(mapNominatim(results[0]), 200, 300);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Geocode failed';
    return errorJson(message, 502);
  }
};
