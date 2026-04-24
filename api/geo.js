export const config = { runtime: 'edge' };

const ALLOWED_ORIGIN_HOSTS = new Set(['yolki.pet', 'www.yolki.pet']);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:') return false;
    if (ALLOWED_ORIGIN_HOSTS.has(hostname)) return true;
    if (hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

export default function handler(request) {
  const h = request.headers;
  const origin = h.get('origin');
  const allowed = isAllowedOrigin(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: allowed ? 204 : 403,
      headers: allowed
        ? {
            'access-control-allow-origin': origin,
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-max-age': '600',
            'vary': 'origin',
          }
        : { 'vary': 'origin' },
    });
  }

  if (origin && !allowed) {
    return new Response('Forbidden', { status: 403 });
  }

  const decode = (v) => {
    if (!v) return null;
    try { return decodeURIComponent(v); } catch { return v; }
  };

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'origin',
  };
  if (allowed) {
    headers['access-control-allow-origin'] = origin;
  }

  return new Response(
    JSON.stringify({
      country: decode(h.get('x-vercel-ip-country')),
      region: decode(h.get('x-vercel-ip-country-region')),
      city: decode(h.get('x-vercel-ip-city')),
    }),
    { headers }
  );
}
