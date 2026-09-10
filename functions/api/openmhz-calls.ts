import { UA, errorJson, json } from './_shared';

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

const SHORT_NAME_RE = /^[a-z0-9_-]+$/i;

interface RawCall {
  _id?: string;
  id?: string;
  talkgroupNum?: number;
  url?: string;
  time?: string;
  len?: number;
  freq?: number;
}

export const onRequestGet = async (context: { request: Request }) => {
  try {
    const url = new URL(context.request.url);
    const shortName = url.searchParams.get('shortName')?.trim() || '';

    if (!shortName || !SHORT_NAME_RE.test(shortName)) {
      return errorJson('shortName is required and must match /^[a-z0-9_-]+$/i');
    }

    const res = await fetch(`https://api.openmhz.com/${encodeURIComponent(shortName)}/calls`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      return errorJson(`OpenMHz calls error (${res.status})`, 502);
    }

    const data = (await res.json()) as { calls?: RawCall[] };
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

    return json(
      {
        shortName,
        calls,
        attribution: 'Audio via OpenMHz',
      },
      200,
      15,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenMHz calls lookup failed';
    return errorJson(message, 502);
  }
};
