import { errorJson, corsHeaders } from './_shared';

const ALLOW = /^https:\/\/media\d*\.openmhz\.com\/media\//i;
const NETLIFY = 'https://noia-aircraft.netlify.app/api/openmhz-audio';

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });

export const onRequestGet = async (context: { request: Request }) => {
  try {
    const reqUrl = new URL(context.request.url);
    const target = (reqUrl.searchParams.get('u') || reqUrl.searchParams.get('url') || '').trim();
    if (!ALLOW.test(target)) {
      return errorJson('url must be an OpenMHz media URL');
    }

    const upstreamUrl = new URL(NETLIFY);
    upstreamUrl.searchParams.set('u', target);

    const headers: Record<string, string> = {
      Accept: '*/*',
      'User-Agent': 'NoiaOps/1.0 (audio-relay)',
    };
    const range = context.request.headers.get('Range');
    if (range) headers.Range = range;

    const upstream = await fetch(upstreamUrl.toString(), { headers });
    const body = upstream.body;
    const outHeaders = new Headers({
      ...corsHeaders(),
      'Content-Type': upstream.headers.get('Content-Type') || 'audio/mp4',
      'Cache-Control': 'public, max-age=120',
    });
    const cr = upstream.headers.get('Content-Range');
    if (cr) outHeaders.set('Content-Range', cr);
    const ar = upstream.headers.get('Accept-Ranges');
    if (ar) outHeaders.set('Accept-Ranges', ar);
    const cl = upstream.headers.get('Content-Length');
    if (cl) outHeaders.set('Content-Length', cl);

    return new Response(body, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audio proxy failed';
    return errorJson(message, 502);
  }
};
