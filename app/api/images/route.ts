import { NextRequest, NextResponse } from 'next/server';

type Orientation = 'auto' | 'landscape' | 'portrait' | 'square';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || '';
  const count = Math.min(parseInt(searchParams.get('count') || '12', 10), 30);
  const orientation = (searchParams.get('orientation') || 'auto') as Orientation;

  const usePexels = !!process.env.PEXELS_API_KEY;
  const useUnsplash = !!process.env.UNSPLASH_ACCESS_KEY;

  if (!usePexels && !useUnsplash) {
    return NextResponse.json(
      { images: [], error: { provider: 'none', status: 400, body: 'No image providers configured' } },
      { status: 200 }
    );
  }

  const results: Array<{
    url: string;
    thumb: string;
    author: string;
    attribution: string;
    provider: 'pexels' | 'unsplash';
    w?: number;
    h?: number;
  }> = [];

  const tasks: Promise<any>[] = [];

  // ---- PEXELS ----
  if (usePexels) {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count * 2, 80)), // fetch extra; we filter after
    });
    if (orientation !== 'auto') params.set('orientation', orientation); // landscape|portrait|square
    tasks.push(
      fetch('https://api.pexels.com/v1/search?' + params.toString(), {
        headers: { Authorization: process.env.PEXELS_API_KEY! },
        cache: 'no-store',
      })
        .then(async (r) => (r.ok ? r.json() : Promise.reject({ provider: 'pexels', status: r.status, body: await r.text() })))
        .then((data) => {
          const photos = (data?.photos || []) as any[];
          for (const p of photos) {
            if (!orientationMatch(p.width, p.height, orientation)) continue;
            results.push({
              url: p.src?.large2x || p.src?.large || p.url,
              thumb: p.src?.medium || p.src?.small || p.src?.tiny,
              author: p.photographer || 'Pexels',
              attribution: `Photo by ${p.photographer} on Pexels`,
              provider: 'pexels',
              w: p.width,
              h: p.height,
            });
          }
        })
        .catch((e) => {
          // swallow but keep info if you want to debug:
          // console.error('[pexels]', e);
        })
    );
  }

  // ---- UNSPLASH ----
  if (useUnsplash) {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count * 2, 30)),
    });
    if (orientation !== 'auto') {
      params.set('orientation', orientation === 'square' ? 'squarish' : orientation); // map square->squarish
    }
    tasks.push(
      fetch('https://api.unsplash.com/search/photos?' + params.toString(), {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY!}` },
        cache: 'no-store',
      })
        .then(async (r) => (r.ok ? r.json() : Promise.reject({ provider: 'unsplash', status: r.status, body: await r.text() })))
        .then((data) => {
          const photos = (data?.results || []) as any[];
          for (const p of photos) {
            if (!orientationMatch(p.width, p.height, orientation)) continue;
            results.push({
              url: p.urls?.regular || p.urls?.full || p.links?.html,
              thumb: p.urls?.small || p.urls?.thumb || p.urls?.regular,
              author: p.user?.name || 'Unsplash',
              attribution: `Photo by ${p.user?.name} on Unsplash`,
              provider: 'unsplash',
              w: p.width,
              h: p.height,
            });
          }
        })
        .catch((e) => {
          // console.error('[unsplash]', e);
        })
    );
  }

  await Promise.all(tasks);

  // Dedupe by thumb/url
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.thumb || r.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Shuffle lightly for variety (so flipping orientation actually looks different)
  deduped.sort(() => Math.random() - 0.5);

  return NextResponse.json({ images: deduped.slice(0, count) });
}

/* ---- helpers ---- */
function orientationMatch(
  w: number,
  h: number,
  o: Orientation
) {
  if (!w || !h || o === 'auto') return true;
  if (o === 'square') return Math.abs(w - h) / Math.max(w, h) < 0.1;
  if (o === 'portrait') return h >= w * 1.05; // clearly taller
  if (o === 'landscape') return w >= h * 1.05; // clearly wider
  return true;
}
