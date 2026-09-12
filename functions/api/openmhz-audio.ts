import { errorJson, corsHeaders } from './_shared';

const ALLOW = /^https:\/\/media\d*\.openmhz\.com\/media\//i;
const NETLIFY = 'https://noia-aircraft.netlify.app/api/openmhz-audio';

function audioContentType(url: string, upstream?: string | null): string {
  const u = url.toLowerCase();
  if (u.includes('.mp3')) return 'audio/mpeg';
  if (u.includes('.m4a') || u.includes('.mp4') || u.includes('.aac')) return 'audio/mp4';
  if (upstream && /^audio\//i.test(upstream)) return upstream;
  // OpenMHz often returns application/octet-stream — Safari won't play that
  return 'audio/mp4';
}

async function fetchOpenMhzMedia(target: string, range: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'User-Agent':
      'Mozilla/5.0 (compatible; NoiaOps/1.0; +https://github.com/saintsola13/noia)',
    Referer: 'https://openmhz.com/',
    Origin: 'https://openmhz.com',
  };
  if (range) headers.Range = range;
  return fetch(target, { headers });
}

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

    const range = context.request.headers.get('Range');
    let upstream = await fetchOpenMhzMedia(target, range);

    // Fallback relay if OpenMHz blocks this edge
    if (!upstream.ok && upstream.status !== 206) {
      const upstreamUrl = new URL(NETLIFY);
      upstreamUrl.searchParams.set('u', target);
      const headers: Record<string, string> = {
        Accept: '*/*',
        'User-Agent': 'NoiaOps/1.0 (audio-relay)',
      };
      if (range) headers.Range = range;
      upstream = await fetch(upstreamUrl.toString(), { headers });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return errorJson(`OpenMHz media failed (${upstream.status})`, 502);
    }

    const outHeaders = new Headers({
      ...corsHeaders(),
      'Content-Type': audioContentType(target, upstream.headers.get('Content-Type')),
      'Cache-Control': 'public, max-age=120',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    });
    const cr = upstream.headers.get('Content-Range');
    if (cr) outHeaders.set('Content-Range', cr);
    outHeaders.set('Accept-Ranges', upstream.headers.get('Accept-Ranges') || 'bytes');
    const cl = upstream.headers.get('Content-Length');
    if (cl) outHeaders.set('Content-Length', cl);

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audio proxy failed';
    return errorJson(message, 502);
  }
};
