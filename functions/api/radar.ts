import { errorJson, json } from './_shared';

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export const onRequestGet = async () => {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return errorJson(`RainViewer error (${res.status})`, 502);
    const data = await res.json();
    return json(data, 200, 60);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Radar fetch failed';
    return errorJson(message, 502);
  }
};
