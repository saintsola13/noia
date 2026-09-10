import { errorJson, json } from './_shared';

const UPSTREAM = 'https://noia-aircraft.netlify.app/api/openmhz-calls';
const SHORT_NAME_RE = /^[a-z0-9_-]+$/i;

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
    const shortName = url.searchParams.get('shortName')?.trim() || '';
    if (!shortName || !SHORT_NAME_RE.test(shortName)) {
      return errorJson('shortName is required and must match /^[a-z0-9_-]+$/i');
    }

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('shortName', shortName);
    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'NoiaOps/1.0 (Cloudflare Pages)' },
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return errorJson('Upstream returned non-JSON', 502);
    }
    if (!res.ok) {
      const err = (data as { error?: string })?.error || `Upstream error (${res.status})`;
      return errorJson(err, 502);
    }
    return json(data, 200, 15);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz calls lookup failed';
    return errorJson(message, 502);
  }
};
