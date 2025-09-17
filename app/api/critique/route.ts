import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreativeBrief = {
  title: string; artist: string; genre: string[]; mood: string[]; themes: string[];
};

export async function POST(req: NextRequest) {
  try {
    const started = Date.now();
    const { brief, draft, goal = 'pre_save' } = await req.json() as {
      brief: CreativeBrief;
      goal?: 'pre_save'|'press_kit'|'tiktok'|'playlist_pitch';
      draft: {
        loglines: string[];
        bio120: string;
        captionsA: string[];
        captionsB: string[];
        plan: { day: string; idea: string; hook: string }[];
      };
    };

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY missing on server' }, { status: 500 });

    const client = new OpenAI({ apiKey });

    const rubric = `
Return JSON with:
{
  "score": number (0-10 overall quality),
  "issues": string[] (concrete problems),
  "suggestions": string[] (concrete fix ideas),
  "captionsWinner": "A" | "B",
  "winnerReasons": string
}
Judge captions A vs B for hook strength, specificity, and fit to goal (${goal}). The rest (loglines/bio/plan) affects overall score.
Keep it concise but actionable.
`;

    const prompt = {
      brief, goal, draft,
      guidelines: 'No clichés. Respect tone. Bio 110–140 words. Plan is concrete and varied.'
    };

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a strict but constructive creative director and editor.' },
        { role: 'user', content: JSON.stringify(prompt) },
        { role: 'user', content: rubric },
      ],
    });

    const content = resp.choices[0]?.message?.content || '{}';
    let data: any = {};
    try { data = JSON.parse(content); } catch {}

    return NextResponse.json({
      ...data,
      tookMs: Date.now() - started,
      model: 'gpt-4o-mini',
      usage: resp.usage ?? undefined,
    });
  } catch (e: any) {
    console.error('[critique] error', e?.status, e?.message);
    return NextResponse.json({ error: `Critique error ${e?.status || ''}: ${e?.message || 'unknown'}` }, { status: 500 });
  }
}
