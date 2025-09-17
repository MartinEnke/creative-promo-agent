import { NextRequest, NextResponse } from 'next/server';
import type { CreativeBrief } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json() as { input?: any };
    if (!input?.type) {
      return NextResponse.json({ error: 'Missing input.type' }, { status: 400 });
    }

    if (input.type === 'link') {
      const url = (input.url || '').trim();
      if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

      const oembedUrl = getOEmbedEndpoint(url);
      let oembed: any = null;
      try {
        const r = await fetch(oembedUrl, { cache: 'no-store', headers: { 'User-Agent': 'creative-promo-agent/1.0' } });
        if (r.ok) oembed = await r.json();
      } catch (_) {}

      const titleRaw: string = oembed?.title || '';
      const author: string = oembed?.author_name || '';
      const provider: string = oembed?.provider_name || inferProvider(url);
      const thumb: string = oembed?.thumbnail_url || '';

      const { artist, track } = parseArtistTitle(titleRaw, author);

      // Optional: genre hint from Apple iTunes Search API (no auth)
      let genreHint = '';
      if (artist && track) {
        try {
          genreHint = await lookupGenre(artist, track);
        } catch (_) {}
      }

      const brief: CreativeBrief = {
        title: [artist, track].filter(Boolean).join(' - ') || titleRaw || 'Untitled',
        artist: artist || author || '',
        genre: genreHint ? [genreHint] : [],
        mood: [],          // leave empty; user/AI should fill this
        themes: [],        // leave empty; user/AI should fill this
        colorHints: [],    // images will drive palette later
      };

      return NextResponse.json({
        brief,
        meta: { provider, thumb, titleRaw, author, url },
      });
    }

    if (input.type === 'brief') {
      const text: string = (input.text || '').trim();
      if (!text) {
        // Keep everything empty; examples are shown in the UI placeholders only.
        const brief: CreativeBrief = { title: 'Untitled', artist: '', genre: [], mood: [], themes: [], colorHints: [] };
        return NextResponse.json({ brief });
      }

      const brief = parseFreeTextBrief(text);
      return NextResponse.json({ brief });
    }

    return NextResponse.json({ error: 'Unsupported input.type' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

/* ---------------- helpers ---------------- */

function inferProvider(link: string) {
  try {
    const u = new URL(link);
    if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) return 'YouTube';
    if (u.hostname.includes('open.spotify.com')) return 'Spotify';
    if (u.hostname.includes('soundcloud.com')) return 'SoundCloud';
  } catch {}
  return 'Unknown';
}

function getOEmbedEndpoint(link: string) {
  const u = new URL(link);
  const enc = encodeURIComponent(link);
  if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) {
    return `https://www.youtube.com/oembed?url=${enc}&format=json`;
  }
  if (u.hostname.includes('open.spotify.com')) {
    return `https://open.spotify.com/oembed?url=${enc}`;
  }
  if (u.hostname.includes('soundcloud.com')) {
    return `https://soundcloud.com/oembed?url=${enc}&format=json`;
  }
  // fallback to YouTube oEmbed
  return `https://www.youtube.com/oembed?url=${enc}&format=json`;
}

function parseArtistTitle(rawTitle: string, fallbackAuthor?: string) {
  if (!rawTitle) return { artist: fallbackAuthor || '', track: '' };
  // Remove common suffixes like (Official Video), [Lyric], etc.
  let t = rawTitle.replace(
    /\s*(\(|\[)(Official|Lyric|Audio|Video|Visualizer|MV|M\/V).*?(\)|\])\s*/gi,
    ''
  ).trim();

  // Pattern: Artist – Track  OR  Artist - Track
  const m = t.match(/\s*([^–-]+)\s*[–-]\s*(.+)\s*/);
  if (m) {
    return { artist: m[1].trim(), track: m[2].trim() };
  }
  // If the title has no separator, try author as artist
  return { artist: (fallbackAuthor || '').trim(), track: t };
}

async function lookupGenre(artist: string, track: string) {
  const url = 'https://itunes.apple.com/search?term=' +
    encodeURIComponent(`${artist} ${track}`) +
    '&entity=song&limit=1';
  const j = await fetch(url, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  const g = j?.results?.[0]?.primaryGenreName;
  return typeof g === 'string' ? g : '';
}

/** Very light parser for free-text briefs.
 * Supports lines like:
 *  Title: ...
 *  Artist: ...
 *  Genre: a, b
 *  Mood: x, y
 *  Themes: one, two
 *  Colors: teal, magenta
 * If no labels are found, we treat text as a mood/theme soup.
 */
function parseFreeTextBrief(text: string): CreativeBrief {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out: CreativeBrief = { title: 'Untitled', artist: '', genre: [], mood: [], themes: [], colorHints: [] };

  const getList = (v: string) =>
    v.split(/[|,/•·]+/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    const [label, ...rest] = line.split(':');
    if (rest.length) {
      const value = rest.join(':').trim();
      const low = label.toLowerCase();
      if (low.startsWith('title')) out.title = value || out.title;
      else if (low.startsWith('artist')) out.artist = value;
      else if (low.startsWith('genre')) out.genre = getList(value);
      else if (low.startsWith('mood')) out.mood = getList(value);
      else if (low.startsWith('theme')) out.themes = getList(value);
      else if (low.startsWith('color')) out.colorHints = getList(value);
      continue;
    }
  }

  // If nothing labeled besides maybe a single line, treat the whole thing as mood/themes soup.
  if (!out.genre.length && !out.mood.length && !out.themes.length && lines.length) {
    const bag = getList(lines.join(', '));
    // simple heuristic: keep short adjectives as "mood", longer/noun-y words as "themes"
    out.mood = bag.filter(w => w.split(/\s+/).length <= 2);
    out.themes = bag.filter(w => w.split(/\s+/).length > 2);
  }

  // Ensure arrays exist
  out.genre = out.genre || [];
  out.mood = out.mood || [];
  out.themes = out.themes || [];
  out.colorHints = out.colorHints || [];

  // Never inject hidden defaults; leave empty if not specified.
  return out;
}
