import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory cache (dev/demo). Replace with KV later if you want persistence.
const cache = new Map<string, any>();

type CreativeBrief = {
  title: string;
  artist: string;
  genre: string[];
  mood: string[];
  themes: string[];
  colorHints?: string[];
};

// Added 'pre_sale' and 'instagram'; kept 'tiktok' for backward-compat
export type Goal = 'pre_save' | 'pre_sale' | 'press_kit' | 'tiktok' | 'instagram' | 'playlist_pitch';

function hashKey(x: any) {
  return crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');
}

function goalHint(goal: Goal) {
  switch (goal) {
    case 'pre_sale':
      return 'Drive pre-orders and pre-sales. Tease product/merch/vinyl. Mention release date or window. Use “pre-order now”, “early access”, “limited drop”. Clear CTA; 0–2 short hashtags.';
    case 'pre_save':
      return 'Focus on short, urgent CTAs driving pre-saves; punchy lines; 1–2 tasteful hashtags.';
    case 'press_kit':
      return 'No hashtags. Industry-facing clarity. Strong loglines. Expand bio with credible details and comparisons.';
    case 'instagram':
      return 'Instagram-native: Reels/Stories/Carousel angles; hook in first 2 seconds; suggest overlays/stickers; “link in bio” or story link; concise captions; 0–2 hashtags.';
    case 'tiktok':
      return 'TikTok-native: hook-first writing, on-screen text beats, trend/sound ideas, quick cuts; keep lines short; max 1 short hashtag.';
    case 'playlist_pitch':
      return 'Curator-facing clarity. Highlight mood, audience fit, and sonic markers. Avoid hype; be specific.';
  }
}

function goalGuards(goal: Goal) {
  if (goal === 'instagram') return 'Use Instagram terms (Reels, Stories, Carousel, link in bio). Do NOT mention TikTok.';
  if (goal === 'tiktok') return 'Use TikTok terms (sounds, hooks). Do NOT mention Instagram/Reels unless given in the brief.';
  if (goal === 'pre_sale') return 'Say pre-order / pre-sale / drop. Do NOT say pre-save.';
  if (goal === 'pre_save') return 'Say pre-save. Do NOT say pre-order / pre-sale unless in brief.';
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const started = Date.now();
    const { brief, palette, goal = 'pre_save', refineNotes } = (await req.json()) as {
      brief: CreativeBrief;
      palette: string[];
      goal?: Goal;
      refineNotes?: string; // optional: quality-gate feedback to refine with
    };
    if (!brief) return NextResponse.json({ error: 'Missing brief' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      console.error('[compose] OPENAI_API_KEY missing');
      return NextResponse.json({ error: 'OPENAI_API_KEY missing on server' }, { status: 500 });
    }

    const cacheKey = hashKey({ brief, palette, goal, refineNotes: refineNotes || '' });
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      return NextResponse.json({ ...cached, cache: true });
    }

    const client = new OpenAI({ apiKey });
    const model = 'gpt-4o-mini';

    const sys = [
      'You are an expert music marketing copywriter and creative director.',
      'Write tight, vivid copy in a modern, credible tone (no clichés).',
      'Reflect the given title/artist/genre/mood/themes.',
      'Use palette colors only as vibe cues; do not name hex codes.',
      goal ? `Goal preset: ${goal} -> ${goalHint(goal)}` : '',
      `Apply the goal preset to ALL sections: loglines, bio120, captionsA, captionsB, and plan.`,
      `Avoid naming other platforms unless explicitly present in the brief. ${goalGuards(goal)}`,
      refineNotes ? `Revise to address the following critique points: ${refineNotes}` : '',
      'Return ONLY valid JSON matching the schema.',
    ].filter(Boolean).join(' ');

    const user = {
      brief,
      palette,
      schema: {
        // NOTE: captionsA & captionsB for A/B testing
        loglines: 'array of 4–6 short punchy one-liners (no hashtags, max ~140 chars each)',
        bio120: 'a 110–140 word artist/track bio (single paragraph)',
        captionsA: 'array of 5–8 caption ideas set A (platform-aware per goal)',
        captionsB: 'array of 5–8 caption ideas set B (stylistically distinct from set A, platform-aware per goal)',
        plan: '7 items for Mon..Sun with keys: day, idea, hook (CTA/angle) — platform-aware per goal',
      },
    };

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(user) },
      ],
    });

    const usage = completion.usage ?? undefined;
    const content = completion.choices[0]?.message?.content || '{}';

    let data: any = {};
    try { data = JSON.parse(content); } catch {}

    const out = {
      loglines: Array.isArray(data.loglines) ? data.loglines.slice(0, 6) : [],
      bio120: typeof data.bio120 === 'string' ? data.bio120 : '',
      captionsA: Array.isArray(data.captionsA) ? data.captionsA.slice(0, 8) : [],
      captionsB: Array.isArray(data.captionsB) ? data.captionsB.slice(0, 8) : [],
      plan: Array.isArray(data.plan) ? data.plan.slice(0, 7) : [],
      model,
      usage,
      tookMs: Date.now() - started,
      cache: false,
    };

    cache.set(cacheKey, out);
    return NextResponse.json(out);
  } catch (e: any) {
    console.error('[compose] error', e?.status, e?.message);
    return NextResponse.json({ error: `OpenAI error ${e?.status || ''}: ${e?.message || 'unknown'}` }, { status: 500 });
  }
}

