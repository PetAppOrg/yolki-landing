export const config = { runtime: 'edge' };

export default function handler(request) {
  const h = request.headers;
  const decode = (v) => {
    if (!v) return null;
    try { return decodeURIComponent(v); } catch { return v; }
  };

  return new Response(
    JSON.stringify({
      country: decode(h.get('x-vercel-ip-country')),
      region: decode(h.get('x-vercel-ip-country-region')),
      city: decode(h.get('x-vercel-ip-city')),
    }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  );
}
