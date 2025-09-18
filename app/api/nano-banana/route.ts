// app/api/nano-banana/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs'; // Need Node for Buffer

// --- helpers ---
const toDataURL = (b64: string, mime = 'image/png') => `data:${mime};base64,${b64}`;

function b64(ab: ArrayBuffer) {
  return Buffer.from(new Uint8Array(ab)).toString('base64');
}

async function urlToInlineData(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const data = b64(await res.arrayBuffer());
    // IMPORTANT: camelCase keys for the GenAI SDK
    return { inlineData: { mimeType: mime, data } };
  } catch {
    return null;
  }
}

// --- health check: GET /api/nano-banana -> { hasKey: boolean } ---
export async function GET() {
  const ok = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return NextResponse.json({ hasKey: ok });
}

// --- generate artwork ---
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY / GOOGLE_API_KEY on server' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      brief,
      palette = [],
      selected = [],
      orientation = 'square', // 'portrait' | 'landscape' | 'square'
    } = body || {};

    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      `Create an album/track cover artwork.`,
      `Title: ${brief?.title || 'Untitled'}`,
      brief?.artist ? `Artist: ${brief.artist}` : '',
      brief?.genre?.length ? `Genre: ${brief.genre.join(', ')}` : '',
      brief?.mood?.length ? `Mood: ${brief.mood.join(', ')}` : '',
      brief?.themes?.length ? `Themes: ${brief.themes.join(', ')}` : '',
      palette.length ? `Use this color palette (inspire, not exact): ${palette.join(', ')}` : '',
      `Composition: ${orientation}.`,
      `Style: clean, bold, streaming-safe cover art with strong typography space and a clear focal point.`,
      `No text in the image.`,
    ].filter(Boolean).join('\n');

    // Inline up to 3 selected refs (palette/texture guidance only)
    const refParts = (
      await Promise.all(
        (selected as Array<{ thumb?: string; url?: string }>).slice(0, 3)
          .map(s => urlToInlineData(s.thumb || s.url || ''))
      )
    ).filter(Boolean) as Array<{ inlineData: { mimeType: string; data: string } }>;

    // Call Gemini 2.5 Flash Image (aka “Nano Banana”)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }, ...refParts] }],
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    // IMPORTANT: camelCase here as well
    const img = parts.find((p: any) => p.inlineData?.data);
    if (!img) {
      const msg = parts.find((p: any) => p.text)?.text || 'No image returned';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const mime = img.inlineData.mimeType || 'image/png';
    const dataUrl = toDataURL(img.inlineData.data, mime);

    return NextResponse.json({
      dataUrl,
      model: response.modelVersion || 'gemini-2.5-flash-image-preview',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Generation failed' },
      { status: 500 }
    );
  }
}
