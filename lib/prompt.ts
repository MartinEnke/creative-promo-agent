import type { CreativeBrief, ImageRef } from '@/lib/types';

export function composeCoverPrompt({
  brief, palette, selected, style, focalSubject, refStrength,
}: {
  brief: CreativeBrief;
  palette: string[];
  selected: ImageRef[];
  style: string;
  focalSubject: string;
  refStrength: number;
}) {
  const title = brief.title || 'Untitled';
  const artist = brief.artist || '—';
  const genres = (brief.genre || []).join(', ');
  const moods = (brief.mood || []).join(', ');
  const themes = (brief.themes || []).join(', ');
  const hexes = (palette || []).join(', ');
  const authors = Array.from(new Set((selected || []).map(s => s.author).filter(Boolean))).slice(0, 4);
  const refLine = authors.length
    ? `Reference vibe inspired by (${authors.join('; ')}), for palette/texture only — do NOT copy exact compositions or watermarks.`
    : '';

  return [
    `Design an **album cover artwork** — Square 1:1. **No text, no logos, no watermarks.**`,
    `Project: ${artist} — ${title}.`,
    genres && `Genre: ${genres}.`,
    moods && `Mood: ${moods}.`,
    themes && `Visual themes: ${themes}.`,
    `Style: ${style}; richly lit, cohesive color grading, subtle film grain, streaming-safe, poster-like hierarchy with ample negative space for future typography.`,
    focalSubject && `Focal subject: ${focalSubject}.`,
    `Composition: clear central focus, depth with foreground/midground/background separation; avoid busy collage unless specified.`,
    hexes && `Color palette (hex, dominant first): ${hexes}. Use palette as primary grade, not just accents.`,
    refLine,
    `Quality: high detail, natural lighting/shadows, avoid plastic sheen or generic stock-photo look.`,
    `Negative: text, letters, numbers, watermark, signature, logos, QR codes, UI, captions, low-res, extra limbs, deformed hands, cut-off faces, bad anatomy.`,
    `Parameters (if supported): aspect=1:1; guidance=7–10; reference_strength=${refStrength}%.`,
  ].filter(Boolean).join('\n');
}
