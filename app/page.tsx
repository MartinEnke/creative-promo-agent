
'use client';
/* eslint-disable @next/next/no-img-element */

// ————————————————————————————————————————————
// Creative Promo Agent — Prompt‑Only Cover Generator (no image API)
// Adds a rich prompt composer you can copy/paste into any image LLM.
// Keeps all your existing curation + palette + content features.
// ————————————————————————————————————————————

import { useEffect, useMemo, useRef, useState } from 'react';
import { CreativeBrief, ImageRef, UserInput } from '@/lib/types';
import { writeBio120, writeCaptions, writeLoglines, weekPlan } from '@/lib/ccopy';

function cx(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' '); }
function toList(s: string): string[] { return (s || '').split(/[|,/•·]+/).map(x => x.trim()).filter(Boolean); }

// Cover prompt options
type StylePreset = 'graphic poster' | 'painterly' | 'cinematic photo' | '3D render' | 'neon collage' | 'ink & grain';

// Orientation is now locked to square in the UI/logic
// (we keep the type for prompt composition/consistency)
type Orientation = 'auto' | 'landscape' | 'portrait' | 'square';

type Goal = 'pre_save' | 'pre_sale' | 'press_kit' | 'tiktok' | 'instagram' | 'playlist_pitch';

const goalLabel = (g: Goal) => ({
  pre_sale: 'Pre-Sale',
  pre_save: 'Pre-Save',
  press_kit: 'Press kit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  playlist_pitch: 'Playlist pitch',
}[g]);


type AIContent = {
  loglines: string[];
  bio120: string;
  captionsA: string[];
  captionsB: string[];
  plan: { day: string; idea: string; hook: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  tookMs?: number;
  cache?: boolean;
};

type Critique = {
  score: number;
  issues: string[];
  suggestions: string[];
  captionsWinner: 'A' | 'B';
  winnerReasons: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  tookMs?: number;
};

export default function Page() {
  // --- Inputs & editable metadata ---
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genreStr, setGenreStr] = useState('');
  const [moodStr, setMoodStr] = useState('');
  const [themesStr, setThemesStr] = useState('');
  const [goal, setGoal] = useState<Goal>('pre_save');

  // --- Images & palette ---
  const [images, setImages] = useState<ImageRef[]>([]);
  const [selected, setSelected] = useState<ImageRef[]>([]);
  const [palette, setPalette] = useState<string[]>([]);

  // Orientation is locked to square (no UI)
  const orientation: Orientation = 'square';

  // --- UI state ---
  const [linkLoading, setLinkLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [critLoading, setCritLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  // --- AI content + critique ---
  const [ai, setAi] = useState<AIContent | null>(null);
  const [crit, setCrit] = useState<Critique | null>(null);

  // --- Prompt Composer state ---
  const [style, setStyle] = useState<StylePreset>('graphic poster');
  const [focalSubject, setFocalSubject] = useState('strong central focal point');
  const [refStrength, setRefStrength] = useState(60); // 0–100 (hint only)
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Theming from palette
  useEffect(() => {
    if (!palette.length) return;
    const { primary, accent, neutral } = roleColors(palette);
    const root = document.documentElement.style;
    root.setProperty('--brand', primary);
    root.setProperty('--accent', accent);
    root.setProperty('--neutral', neutral);
  }, [palette]);

  // Build brief for copy + PDF
  const workingBrief = useMemo<CreativeBrief>(() => ({
    title: title || 'Untitled',
    artist: artist || '',
    genre: toList(genreStr),
    mood: toList(moodStr),
    themes: toList(themesStr),
    colorHints: [],
  }), [title, artist, genreStr, moodStr, themesStr]);

  // Auto-compose cover prompt whenever inputs change
  useEffect(() => {
    setPrompt(composeCoverPrompt({ brief: workingBrief, palette, selected, style, focalSubject, orientation, refStrength }));
    setCopied(false);
  }, [workingBrief, palette, selected, style, focalSubject, orientation, refStrength]);

  // Link → auto-fill
  async function fetchFromLink() {
    if (!link.trim()) return;
    setLinkLoading(true); setMsg(null);
    try {
      const payload: UserInput = { type: 'link', url: link };
      const r = await fetch('/api/ingest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: payload }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const b = j.brief as CreativeBrief;
      setTitle(b.title || '');
      setArtist(b.artist || '');
      if (b.genre?.length) setGenreStr(b.genre.join(', '));
    } catch (e: any) {
      setMsg(e?.message || 'Failed to ingest link');
    } finally {
      setLinkLoading(false);
    }
  }

  // One-click demo
  async function runDemo() {
    setTitle('These Days (Don’t Make Me Wait)');
    setArtist('Llewellyn');
    setGenreStr('synthwave, indie pop');
    setMoodStr('nocturnal, euphoric');
    setThemesStr('neon city, rain, 2 AM streets');
    setGoal('pre_sale');
    await searchImages('neon city rain 2 AM streets');
    setTimeout(() => {
      const picks = images.slice(0, 2);
      setSelected(picks);
      extractPalette(picks.map(p => p.thumb)).then(setPalette);
      setTimeout(() => handleExecute(), 250);
    }, 250);
  }

  // Search based on THEMES (orientation fixed to square)
  async function curateFromThemes() {
    const q = toList(themesStr).join(' ');
    if (!q) { setMsg('Add a few themes first (e.g., neon city, rain).'); return; }
    await searchImages(q);
  }

  // ————————————————————————————————————————————
  // Image search (square) — removed orientation filtering
  // ————————————————————————————————————————————

  const dimsCache = useRef(new Map<string, { w: number; h: number }>());
  function getDims(img: ImageRef): Promise<{ w: number; h: number }>{
    const key = img.thumb || img.url;
    const cached = dimsCache.current.get(key);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => {
        const dims = { w: el.naturalWidth || 1, h: el.naturalHeight || 1 };
        dimsCache.current.set(key, dims);
        resolve(dims);
      };
      el.onerror = () => resolve({ w: 1, h: 1 });
      el.src = key;
    });
  }

  async function searchImages(query: string) {
    setImgLoading(true); setMsg(null);
    setSelected([]); setPalette([]); setExecuted(false); setAi(null); setCrit(null);
    const url = '/api/images?count=20&orientation=square&query=' + encodeURIComponent(query);
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) {
      const detail = typeof j.error === 'string' ? j.error : [j.error.provider, j.error.status, j.error.body].filter(Boolean).join(' • ');
      setImages([]); setMsg('Image search failed: ' + detail);
    } else if (!j.images || j.images.length === 0) {
      setImages([]); setMsg('No images found for this query. Try simpler terms.');
    } else {
      const raw: ImageRef[] = j.images;
      setImages(raw); // no orientation filtering; we crop to square in CSS
    }
    setImgLoading(false);
  }

  function toggle(img: ImageRef) {
    setSelected(prev => {
      const exists = prev.find(p => p.url === img.url);
      const next = exists ? prev.filter(p => p.url !== img.url) : [...prev, img].slice(0, 12);
      extractPalette(next.map(s => s.thumb)).then(setPalette).catch(()=>setPalette([]));
      setExecuted(false); setAi(null); setCrit(null);
      return next;
    });
  }

  async function handleExecute() {
    if (selected.length === 0 || !palette.length) return;
    setAiLoading(true); setMsg(null); setAi(null); setCrit(null);

    try {
      const rc = await fetch('/api/compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: workingBrief, palette, goal }),
      });
      const j = await rc.json();
      if (j.error) throw new Error(j.error);
      setAi(j);

      const rr = await fetch('/api/critique', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: workingBrief, goal, draft: j }),
      });
      const c = await rr.json();
      if (c.error) throw new Error(c.error);
      setCrit(c);

      if ((c.score ?? 0) < 7 && c.suggestions?.length) {
        const r2 = await fetch('/api/compose', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief: workingBrief, palette, goal, refineNotes: c.suggestions.join('; ') })
        });
        const j2 = await r2.json();
        if (!j2.error) setAi(j2);
      }

      setExecuted(true);
    } catch (e: any) {
      setMsg(e?.message || 'AI compose/critique failed — showing fallback content.');
      setExecuted(true);
    } finally {
      setAiLoading(false); setCritLoading(false);
    }
  }

  function exportPDF() { exportAsPDF({ brief: workingBrief, selected, palette, ai, crit, goal }); }

  /* ---------- Palette block (to be overlaid in grid) ---------- */
  function PaletteBlock({ palette }: { palette: string[] }) {
    return (
      <div className="card palette-card">
        {palette.length === 0 ? (
          <p className="text-sm text-muted">
            Select 1–3 images and we’ll extract a 5-color palette.
          </p>
        ) : (
          <div className="swatch-row">
            {palette.map((hex, i) => (
              <div key={i} className="swatch" style={{ background: hex }}>
                <span className="swatch-tag">{hex}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const genreChips = toList(genreStr);
  const moodChips  = toList(moodStr);
  const themeChips = toList(themesStr);

  // ————————————————————————————————————————————
  // UI
  // ————————————————————————————————————————————
  return (
    <>
      {/* Header */}
<header className="site-header">
  <div className="container header-row">
    <div className="brand">
      <div className="brand-dot" />
      <span>Creative AI Promo Agent</span>
    </div>
    <div className="header-actions">
      <button className="btn-secondary" onClick={runDemo}>Try demo</button>

      {/* Only active after Execute Promo Agent has run, with images + palette */}
      <button
        className="btn-primary btn-hero"
        onClick={exportPDF}
        disabled={!executed || !palette.length || !selected.length}
        title={!executed ? 'Run “Execute Promo Agent” first' : undefined}
        aria-disabled={!executed || !palette.length || !selected.length}
      >
        Export PDF
      </button>
    </div>
  </div>
</header>

      <main className="container page-grid">
        {/* LEFT COLUMN */}
        <section className="section">
<div className="section-toolbar toolbar-glow is-brief">
<SectionHead step="1" title="Brief" subtitle="Track details and creative direction." />
</div>

          {/* Goal chips (labels updated) */}
          <div className="group-block">
            <div className="label">Goal</div>
            <div className="chip-row">
              {([
                { id: 'pre_sale', label: 'Pre-Sale' },
                { id: 'press_kit', label: 'Press kit' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'playlist_pitch', label: 'Playlist pitch' },
              ] as {id:Goal;label:string}[]).map(opt => (
                <button key={opt.id} onClick={()=>setGoal(opt.id)} className={cx('chip-toggle chip-toggle--lg', goal===opt.id && 'chip-toggle--on')}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Link helper */}
          <div className="group-block">
            <div className="label">Track link</div>
            <div className="row gap-8">
              <input value={link} onChange={e=>setLink(e.target.value)} placeholder="YouTube / Spotify / SoundCloud URL" className="input input--md" />
              <button
  type="button"
  className="btn-primary-soft btn-lg"
  onClick={fetchFromLink}
  disabled={linkLoading || !link.trim()}
  aria-busy={linkLoading}
>
  {linkLoading ? 'Fetching…' : 'OK'}
</button>
            </div>
            <p className="hint">We’ll try to auto-fill Title/Artist. You can edit anytime.</p>
          </div>

          {/* Metadata */}
          <div className="group-block">
            <div className="label">Track metadata</div>
            <div className="stack-8">
              <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" />
              <input className="input" value={artist} onChange={e=>setArtist(e.target.value)} placeholder="Artist" />
            </div>
          </div>

          {/* Creative direction */}
          <div className="group-block">
            <div className="label">Creative direction</div>
            <div className="stack-8">
              <input className="input" value={genreStr} onChange={e=>setGenreStr(e.target.value)} placeholder="Genre (comma-separated)" />
              <ChipPreview items={genreChips} />
              <input className="input" value={moodStr}  onChange={e=>setMoodStr(e.target.value)}  placeholder="Mood (comma-separated)" />
              <ChipPreview items={moodChips} />
              <input className="input" value={themesStr} onChange={e=>setThemesStr(e.target.value)} placeholder="Themes (comma-separated, visual)" />
              <ChipPreview items={themeChips} />

              {/* Moved here: Search Images */}
              <div className="cd-search">
  <button
    type="button"
    className="btn btn-primary-soft btn-pill btn-lg"
    onClick={curateFromThemes}
    disabled={imgLoading}
    aria-busy={imgLoading}
  >
    {imgLoading ? 'Searching…' : 'Search Images'}
  </button>
</div>
              {msg && <p className="msg-error">{msg}</p>}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section className="section">
<div className="section-toolbar toolbar-glow is-exec">
<SectionHead step="2" title="Execute & content" subtitle="Generate and refine copy for your release." />
<div className="row gap-8">
<span className="badge">Selected: {selected.length}</span>
<button className="btn-primary btn-hero" onClick={handleExecute} disabled={selected.length === 0 || !palette.length || aiLoading || critLoading}>
{(aiLoading || critLoading) ? 'Generating…' : 'Execute Promo Agent'}
</button>
</div>
</div>

          {/* Image grid (square) with palette overlay */}
          <div className="card image-card">
            {images.length === 0 ? (
              <p className="text-sm text-muted">Add themes and click “Search Images”.</p>
            ) : (
              <div className="image-grid" data-orient={orientation}>
                {images.slice(0, 20).map((img, i) => {
                  const isSel = !!selected.find(s => s.url === img.url);
                  return (
                    <button key={i} onClick={() => toggle(img)} className={cx('tile image-tile', isSel && 'selected')} title={img.attribution}>
                      <img src={img.thumb} alt="ref" className="image-tile-img" />
                      <div className="tile-cap">{img.author}</div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="hint mt-2">Tip: pick <b>1–3 images</b> for a clean palette.</p>
           
            {/* Palette now lives inside the grid card, bottom-right */}
            <div className="palette-overlay">
              <PaletteBlock palette={palette} />
            </div>
          </div>

          {/* —— Prompt Composer —— */}
<div className="card card--composer">
  {/* Section label styled like .label, just a bit bigger */}
  <div className="label label-lg pc-section-label">Build Cover Prompt</div>
<br />
<div className="pc-row pc-style">
  <div className="chip-row">
    {(['graphic poster','painterly','cinematic photo','3D render','neon collage','ink & grain'] as StylePreset[]).map(s => (
      <button
        key={s}
        className={cx('chip-toggle chip-toggle--lg', style===s && 'chip-toggle--on')}
        onClick={()=>setStyle(s)}
      >
        {s}
      </button>
    ))}
  </div>
</div>

  <div className="pc-row">
    <input
      className="input"
      placeholder="Focal subject (optional) — e.g., lone figure with umbrella, retro car, neon skyline"
      value={focalSubject}
      onChange={e=>setFocalSubject(e.target.value)}
    />
  </div>

  {/* Single-line slider with inline explanation */}
  {/* Ref Influence — single line, no layout shift */}
  <div className="pc-row pc-range">
  <label className="label pc-label">Ref Influence</label>
  <input
    type="range"
    min={0}
    max={100}
    value={refStrength}
    onChange={e=>setRefStrength(parseInt(e.target.value))}
    className="pc-slider"
    aria-label="Reference influence"
  />
  <span className="hint pc-hint-inline">
    <span className="pc-val">{refStrength}%</span>
    <span className="pc-expl"> — how strongly to lean on your selected refs (if the model supports it)</span>
  </span>
</div>

  <textarea className="input prompt-input pc-textarea" readOnly value={prompt} />

  <div className="pc-footer">
    <span className="hint">Aspect: <b>Square (1:1)</b>. Paste this prompt into ChatGPT, Midjourney, etc.</span>
    <div className="pc-actions">
  <button
    className="btn btn-secondary btn-pill btn-lg"
    onClick={async()=>{ await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(()=>setCopied(false), 1200); }}
  >
    {copied ? 'Copied ✓' : 'Copy prompt'}
  </button>

  <a
    className="btn btn-secondary btn-pill btn-lg"
    href={`data:text/plain;charset=utf-8,${encodeURIComponent(prompt)}`}
    download={`${(workingBrief.title || 'cover').replace(/\s+/g,'_')}_prompt.txt`}
  >
    Download
  </a>
</div>
  </div>
</div>


          {/* Content (smaller type) */}
          {executed && (palette.length > 0) && (
            <CopyPanel brief={workingBrief} ai={ai} crit={crit} />
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container footer-row">
          <span className="text-muted">© 2025 Creative AI Promo Agent</span>
          <div className="footer-links">
            <a href="#" className="text-muted">Docs</a>
            <a href="#" className="text-muted">Changelog</a>
            <a href="#" className="text-muted">Feedback</a>
          </div>
        </div>
      </footer>
    </>
  );
}

/* ---------- Small presentational pieces ---------- */
function SectionHead({ step, title, subtitle, compact=false }: { step: string; title: string; subtitle?: string; compact?: boolean }) {
  return (
    <div className={cx('section-head', compact && 'section-head--compact')}>
      <span className="chip-step">{step}</span>
      <div className="head-text">
        <h3 className="section-title">{title}</h3>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
function ChipPreview({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="chip-row">
      {items.map((it,i)=> <span className="chip" key={i}>{it}</span>)}
    </div>
  );
}

/* ---------- Copy Panel (A/B + winner, smaller type) ---------- */
function CopyPanel({ brief, ai, crit }: { brief: CreativeBrief; ai: AIContent | null; crit: Critique | null }) {
  const winner   = crit?.captionsWinner ?? 'A';
  const logs     = ai?.loglines ?? writeLoglines(brief);
  const bio      = ai?.bio120  ?? writeBio120(brief);
  const plan     = ai?.plan    ?? weekPlan(brief);
  const captions = ai ? (winner === 'A' ? ai.captionsA : ai.captionsB) : writeCaptions(brief);
  const hasAI    = !!ai;

  // OPTIONAL: rename the section title from "Loglines" to a more promo-native word:
  const LOG_TITLE = 'Hooks'; // or 'Taglines' / 'Key Phrases'

  return (
    <div className="card content-card content-pro">
      {/* Box label */}
      <div className="label label-lg content-label">Content Creation</div>

      {/* Group: Loglines (aka Hooks) */}
      <section className="content-group">
        <div className="content-head">
          <h4 className="content-title">{LOG_TITLE}</h4>
          <div className="meta">
            <span className="badge">{hasAI ? 'AI' : 'Fallback'}</span>
          </div>
        </div>
        <ul className="content-list">
          {logs.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>

      <div className="divider" />

      {/* Group: Bio */}
      <section className="content-group">
        <div className="content-head">
          <h4 className="content-title">120-word Bio</h4>
          <div className="meta">
            <span className="badge">{hasAI ? 'AI' : 'Fallback'}</span>
          </div>
        </div>
        <p className="content-body">{bio}</p>
      </section>

      <div className="divider" />

      {/* Group: Captions A/B */}
      <section className="content-group">
        <div className="content-head">
          <h4 className="content-title">Captions (A/B)</h4>
          <div className="meta">
            <span className="badge">{hasAI ? 'AI' : 'Fallback'}</span>
            {crit && <span className="badge">QA</span>}
            {ai && <span className="meta-item">Winner: <b>{winner}</b></span>}
            {crit?.winnerReasons && <span className="meta-item">Why: {crit.winnerReasons}</span>}
          </div>
        </div>

        {ai ? (
          <div className="caption-grid">
            <div>
              <div className={cx('content-sub', winner==='A' && 'text-win')}>Set A {winner==='A' && '• Selected'}</div>
              <ul className="content-list">{ai.captionsA.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
            </div>
            <div>
              <div className={cx('content-sub', winner==='B' && 'text-win')}>Set B {winner==='B' && '• Selected'}</div>
              <ul className="content-list">{ai.captionsB.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
            </div>
          </div>
        ) : (
          <ul className="content-list">{captions.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
        )}
      </section>

      <div className="divider" />

      {/* Group: 7-Day Plan */}
      <section className="content-group">
        <div className="content-head">
          <h4 className="content-title">7-Day Plan</h4>
          <div className="meta">
            <span className="badge">{hasAI ? 'AI' : 'Fallback'}</span>
            {crit?.issues?.length ? <span className="badge">QA</span> : null}
          </div>
        </div>

        <ul className="content-list plan-list">
          {plan.map((d,i)=>(
            <li key={i}>
              <span className="plan-day">{d.day}:</span> {d.idea}
              <span className="plan-hook"> — {d.hook}</span>
            </li>
          ))}
        </ul>

        {crit?.issues?.length ? (
          <div className="qa-notes">
            <div className="qa-title">Referee notes</div>
            <ul className="content-list">{crit.issues.map((x,i)=>(<li key={i}>{x}</li>))}</ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}


/* ---------- Prompt composer ---------- */
function composeCoverPrompt({
  brief,
  palette,
  selected,
  style,
  focalSubject,
  orientation,
  refStrength,
}: {
  brief: CreativeBrief;
  palette: string[];
  selected: ImageRef[];
  style: StylePreset;
  focalSubject: string;
  orientation: Orientation;
  refStrength: number;
}) {
  const title = brief.title || 'Untitled';
  const artist = brief.artist || '—';
  const genres = (brief.genre || []).join(', ');
  const moods = (brief.mood || []).join(', ');
  const themes = (brief.themes || []).join(', ');
  const hexes = (palette || []).join(', ');
  const authors = Array.from(new Set((selected || []).map(s => s.author).filter(Boolean))).slice(0, 4);
  const refLine = authors.length ? `Reference vibe inspired by (${authors.join('; ')}), for palette/texture only — do NOT copy exact compositions or watermarks.` : '';
  const ar = orientation === 'portrait' ? 'Portrait 4:5' : orientation === 'landscape' ? 'Landscape 3:2' : 'Square 1:1';

  return [
    // Task
    `Design an **album cover artwork** — ${ar}. **No text, no logos, no watermarks.**`,
    // Project context
    `Project: ${artist} — ${title}.`,
    genres && `Genre: ${genres}.`,
    moods && `Mood: ${moods}.`,
    themes && `Visual themes: ${themes}.`,
    // Style
    `Style: ${style}; richly lit, cohesive color grading, subtle film grain, streaming‑safe, poster‑like hierarchy with ample negative space for future typography.`,
    // Focal + composition
    focalSubject && `Focal subject: ${focalSubject}.`,
    `Composition: clear central focus, depth with foreground/midground/background separation; avoid busy collage unless specified.`,
    // Palette
    hexes && `Color palette (hex, dominant first): ${hexes}. Use palette as primary grade, not just accents.`,
    // Refs (conceptual)
    refLine,
    // Quality & constraints
    `Quality: high detail, natural lighting/shadows, avoid plastic sheen or generic stock‑photo look.`,
    `Negative: text, letters, numbers, watermark, signature, logos, QR codes, UI, captions, low‑res, extra limbs, deformed hands, cut‑off faces, bad anatomy.`,
    // Model‑hint parameters (many models ignore this but it helps users copy to various tools)
    `Parameters (if supported): aspect=1:1; guidance=7–10; reference_strength=${refStrength}%.`,
  ].filter(Boolean).join('\n');
}

/* ---------- Palette extraction & helpers (unchanged logic) ---------- */
async function extractPalette(urls: string[], k = 5): Promise<string[]> {
  if (!urls.length) return [];
  const pixels: number[][] = [];
  for (const url of urls.slice(0, 6)) {
    const img = await loadImage(url);
    const { data } = toImageData(img, 80, 80);
    for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i+1], data[i+2]]);
  }
  return kmeansColors(pixels, k).map(rgbToHex);
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej)=>{ const img = new Image(); img.crossOrigin='anonymous'; img.onload=()=>res(img); img.onerror=rej; img.src=src; });
}
function toImageData(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0,0,w,h).data; return { data };
}
function kmeansColors(pixels: number[][], k: number): number[][] {
  if (!pixels.length) return Array.from({length:k},()=>[200,200,200]);
  const centroids = Array.from({length:k}, ()=> pixels[Math.floor(Math.random()*pixels.length)]);
  for (let iter=0; iter<8; iter++) {
    const buckets: number[][][] = Array.from({length:k},()=>[]);
    for (const p of pixels) {
      let bi=0, bd=Infinity; for (let i=0;i<k;i++){ const d=dist2(p,centroids[i]); if(d<bd){bd=d;bi=i;} } buckets[bi].push(p);
    }
    for (let i=0;i<k;i++){
      if(!buckets[i].length) continue;
      const mean = [0,0,0]; for (const p of buckets[i]) { mean[0]+=p[0]; mean[1]+=p[1]; mean[2]+=p[2]; }
      centroids[i] = mean.map(v=>Math.round(v / buckets[i].length)) as number[];
    }
  }
  return centroids;
}
function dist2(a:number[], b:number[]){ const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2]; return dr*dr+dg*dg+db*db; }
function rgbToHex([r,g,b]: number[]){ return '#' + [r,g,b].map(x=> x.toString(16).padStart(2,'0')).join(''); }

/* ---------- Color & contrast helpers ---------- */
function roleColors(palette: string[]) {
  if (!palette.length) return { primary: '#5468ff', accent: '#ff4d6d', neutral: '#111827' };
  const withL = palette.map(hex => { const { h, s, l } = hexToHsl(hex); return { hex, h, s, l }; });
  const primary = withL.filter(c => c.l > 0.25 && c.l < 0.75).sort((a,b)=> (b.s - a.s) || Math.abs(0.5-b.l) - Math.abs(0.5-a.l))[0]?.hex || palette[0];
  const ph = hexToHsl(primary).h;
  const accent = withL.sort((a,b)=> hueDistance(b.h, ph) - hueDistance(a.h, ph))[0]?.hex || palette[1] || primary;
  const neutral = withL.sort((a,b)=> a.l - b.l)[0]?.hex || '#111827';
  return { primary, accent, neutral };
}
function hexToHsl(hex: string) {
  const { r,g,b } = hexToRgb(hex);
  const r1=r/255, g1=g/255, b1=b/255;
  const max=Math.max(r1,g1,b1), min=Math.min(r1,g1,b1);
  let h=0,s=0,l=(max+min)/2;
  const d=max-min;
  if(d!==0){ s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){ case r1: h=(g1-b1)/d + (g1<b1?6:0); break;
      case g1: h=(b1-r1)/d + 2; break;
      default: h=(r1-g1)/d + 4; break; }
    h/=6;
  }
  return { h, s, l };
}
function hexToRgb(hex: string){ const v=parseInt(hex.slice(1),16); return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 }; }
function hueDistance(a:number,b:number){ const d=Math.abs(a-b); return Math.min(d,1-d); }


/* ---------- PDF export (final, with consistent spacing) ---------- */
function exportAsPDF({
  brief, selected, palette, ai, crit, goal
}: {
  brief: CreativeBrief;
  selected: ImageRef[];
  palette: string[];
  ai?: AIContent | null;
  crit?: Critique | null;
  goal: Goal;
}) {
  // —— HARD GUARD ————————————————————————————————————————
  // Require: brief, ≥1 selected image, ≥1 palette color, and AI content present
  const guardReason =
    !brief ? 'Missing brief' :
    !Array.isArray(selected) || selected.length === 0 ? 'Select at least one image' :
    !Array.isArray(palette) || palette.length === 0 ? 'Palette not ready' :
    !ai ? 'Run “Execute Promo Agent” first' :
    ''; // OK

  if (guardReason) {
    // Optional: show a toast/message if you have setMsg
    // setMsg?.(guardReason);  // uncomment if you have setMsg in scope
    console.warn('[exportAsPDF] blocked:', guardReason);
    return;
  }
  // ————————————————————————————————————————————————
  import('jspdf').then(({ default: jsPDF }) => {
    // Brand roles from palette (same as app)
    const roles = roleColors(palette);
    const pr = hexToRgb(roles.primary);
    const ac = hexToRgb(roles.accent);

    // Doc + metrics
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = (doc as any).internal.pageSize.getWidth();
    const H = (doc as any).internal.pageSize.getHeight();
    const M = 40;
    const MAX = W - M * 2;
    let y = M;

    // ---- spacing / rhythm tokens ----
    const SP = {
      sectionTop: 24,        // space before Palette / Moodboard / Content
      afterSectionHead: 14,  // NEW: gap after section underline
      groupTop: 16,          // space before Hooks / Bio / Captions / Plan
      afterGroupHead: 12,    // NEW: gap after group underline
      blockGap: 12,
      line: 14
    };
    const vspace = (h = SP.blockGap) => { y += h; };

    // Helpers
    const setH = (
      size: number = 12,
      bold: boolean = false,
      color: number | { r: number; g: number; b: number } = 20
    ) => {
      if (typeof color === 'number') doc.setTextColor(color);
      else doc.setTextColor(color.r, color.g, color.b);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
    };
    const ensure = (need = 0) => { if (y + need > H - M) { doc.addPage(); y = M; } };
    const line = (x1:number, y1:number, x2:number, y2:number, col = ac) => {
      // @ts-ignore
      doc.setDrawColor(col.r, col.g, col.b); doc.setLineWidth(1);
      doc.line(x1, y1, x2, y2);
    };

    // Badges (AI / Fallback / QA) aligned right
    const badgeDims = (label:string) => {
      setH(10, true);
      const tw = (doc as any).getTextWidth(label);
      const padX = 6, h = 16, w = tw + padX*2;
      return { w, h, padX };
    };
    const drawBadgesRight = (labels: {text:string; tone:'brand'|'accent'|'muted'}[]) => {
      const dims = labels.map(l => badgeDims(l.text));
      const totalW = dims.reduce((s,d)=>s+d.w,0) + (labels.length-1)*6;
      let x = M + MAX - totalW, yy = y - 12;
      labels.forEach((l,i)=>{
        const d = dims[i];
        const col = l.tone==='brand' ? pr : (l.tone==='accent' ? ac : {r:120,g:130,b:150});
        // @ts-ignore
        doc.setFillColor(col.r, col.g, col.b);
        doc.setDrawColor(col.r, col.g, col.b);
        doc.roundedRect(x, yy, d.w, d.h, 6, 6, 'FD');
        setH(10, true, 255); (doc as any).text(l.text, x + d.padX, yy + 11);
        x += d.w + 6;
      });
    };

    // Labels & heads with spacing baked in
    const sectionLabel = (text: string) => {
      vspace(SP.sectionTop);
      ensure(22);
      setH(11, true, pr);
      (doc as any).text(text.toUpperCase(), M, y);
      y += 6;
      line(M, y, W - M, y, pr);
      y += SP.afterSectionHead;          // more gap after underline
      setH(10, false, 20);
    };
    
    const addH2 = (t: string) => {
      vspace(SP.sectionTop);
      ensure(24);
      setH(12, true, pr);
      (doc as any).text(t, M, y);
      y += 6;
      line(M, y, W - M, y, ac);
      y += SP.afterSectionHead;          // more gap after underline
      setH(10, false, 20);
    };
    
    const groupHead = (
      title: string,
      badges: { text: string; tone: 'brand' | 'accent' | 'muted' }[] = []
    ) => {
      vspace(SP.groupTop);
      ensure(22);
      setH(12, true, 20);
      (doc as any).text(title, M, y);
      if (badges.length) drawBadgesRight(badges);
      y += 12;
      // hairline
      // @ts-ignore
      doc.setDrawColor(200); doc.setLineWidth(0.6);
      doc.line(M, y, W - M, y);
      y += SP.afterGroupHead;            // more gap after underline
      setH(10, false, 20);
    };
    

    const addParagraph = (t:string) => {
      if (!t) return;
      const lines = (doc as any).splitTextToSize(t, MAX) as string[];
      lines.forEach(L => { ensure(SP.line); (doc as any).text(L, M, y); y += SP.line; });
    };
    const addBullets = (arr:string[], max=arr.length) => {
      arr.slice(0,max).forEach(it=>{
        const lines = (doc as any).splitTextToSize('• ' + it, MAX) as string[];
        lines.forEach(L => { ensure(SP.line); (doc as any).text(L, M, y); y += SP.line; });
      });
    };

    // Two-column lists for Captions A/B
    const twoColumnLists = (leftTitle:string, left:string[], rightTitle:string, right:string[]) => {
      const colGap = 14;
      const colW = (MAX - colGap) / 2;

      ensure(16);
      setH(10, false, 120);
      (doc as any).text(leftTitle, M, y);
      (doc as any).text(rightTitle, M + colW + colGap, y);
      y += 8; setH(10, false, 20);

      let yStart = y, yL = yStart, yR = yStart;

      const writeList = (items:string[], x:number, yPos:number) => {
        items.forEach(txt=>{
          const lines = (doc as any).splitTextToSize('• ' + txt, colW) as string[];
          lines.forEach(L => { if (yPos + SP.line > H - M) { doc.addPage(); yPos = M; }
            (doc as any).text(L, x, yPos); yPos += SP.line; });
        });
        return yPos;
      };

      yL = writeList(left, M, yL);
      yR = writeList(right, M + colW + colGap, yR);

      y = Math.max(yL, yR) + 2;
      vspace(4);
    };

    /* ----------------- Title bar ----------------- */
    setH(18, true, pr);
    (doc as any).text('Creative Promo – ' + (brief.title || 'Untitled'), M, y);
    y += 12; line(M, y, W - M, y, ac); y += 16;

    setH(10);
    const metaLine = `Artist: ${brief.artist || '—'}  |  Goal: ${goal}  |  Genre: ${(brief.genre||[]).join(', ') || '—'}  |  Mood: ${(brief.mood||[]).join(', ') || '—'}  |  Themes: ${(brief.themes||[]).join(', ') || '—'}`;
    (doc as any).text(metaLine, M, y, { maxWidth: MAX });
    y += 8;

    /* ----------------- Palette ----------------- */
    addH2('Palette');
    const sw=24, gap=8;
    ensure(sw + 8);
    palette.forEach((hex,i)=>{ const x=M+i*(sw+gap); const c=hexToRgb(hex);
      // @ts-ignore
      doc.setFillColor(c.r,c.g,c.b); doc.rect(x,y,sw,sw,'F'); doc.setDrawColor(200); doc.rect(x,y,sw,sw);
    });
    y += sw + 6; vspace(SP.blockGap);

    /* ----------------- Moodboard ----------------- */
    addH2('Moodboard');
    const cols=4, iw=110, ih=72, ig=10;
    const picks = selected.slice(0,12);
    const rows = Math.ceil(picks.length/cols) || 1;
    const gridHeight = rows*ih + (rows-1)*ig;
    const startY = y; ensure(gridHeight + 10);

    const addImagePromises = picks.map((img, idx)=> new Promise<void>((resolve)=>{
      const image = new Image(); image.crossOrigin='anonymous';
      image.onload=()=>{ const x = M + (idx % cols)*(iw+ig); const yy = startY + Math.floor(idx/cols)*(ih+ig);
        // @ts-ignore
        doc.addImage(image,'JPEG',x,yy,iw,ih,undefined,'FAST'); resolve(); };
      image.src = img.thumb;
    }));

    Promise.all(addImagePromises).then(()=>{
      y = startY + gridHeight + 6; vspace(SP.blockGap);

      /* ----------------- CONTENT CREATION ----------------- */
      sectionLabel('Content Creation');

      const hasAI = !!ai;
      const LOG_TITLE = 'Hooks'; // or 'Taglines'

      // Hooks / Loglines
      groupHead(LOG_TITLE, [{ text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }]);
      addBullets(ai?.loglines ?? writeLoglines(brief), 6);

      // Bio
      groupHead('120-word Bio', [{ text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }]);
      addParagraph(ai?.bio120 ?? writeBio120(brief));

      // Captions
      const winner = crit?.captionsWinner ?? 'A';
const reason = crit?.winnerReasons || '';
const captionBadges: { text: string; tone: 'brand' | 'accent' | 'muted' }[] = [
  { text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }
];
if (crit) captionBadges.push({ text: 'QA', tone: 'accent' });
groupHead('Captions (A/B)', captionBadges);

vspace(6);  // NEW: breathing room between underline and winner line

if (ai && winner) {
  setH(10, false, 120);
  (doc as any).text(`Winner: ${winner}${reason ? ' — ' + reason : ''}`, M, y);
  vspace(20);  // NEW: extra gap before the two columns
  setH(10, false, 20);
}

if (ai) {
  twoColumnLists(
    `Set A${winner === 'A' ? ' • Selected' : ''}`, ai.captionsA || [],
    `Set B${winner === 'B' ? ' • Selected' : ''}`, ai.captionsB || [],
  );
} else {
  addBullets(writeCaptions(brief), 8);
}

      // 7-Day Plan
      const planBadges: {text:string;tone:'brand'|'accent'|'muted'}[] = [
        { text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }
      ];
      if (crit?.issues?.length) planBadges.push({ text: 'QA', tone: 'accent' });
      groupHead('7-Day Plan', planBadges);

      const plan = ai?.plan ?? weekPlan(brief);
      plan.forEach(d=>{
        const lineTxt = `${d.day}: ${d.idea} — ${d.hook}`;
        const lines = (doc as any).splitTextToSize(lineTxt, MAX) as string[];
        lines.forEach(L=>{ ensure(SP.line); (doc as any).text(L, M, y); y += SP.line; });
      });

      // QA notes (optional)
      if (crit?.issues?.length) {
        vspace(6);
        // @ts-ignore
        doc.setDrawColor(200); doc.setLineWidth(0.6);
        doc.line(M, y, W-M, y); vspace(8);

        setH(11, true, 20);
        (doc as any).text('Referee notes', M, y); vspace(10);
        setH(10, false, 20);
        addBullets(crit.issues);
      }

      /* ----------------- Appendix ----------------- */
      doc.addPage(); y = M;
      addH2('Appendix: Inputs & QA');
      addParagraph(`Goal: ${goal}`);
      addParagraph(`Title: ${brief.title} | Artist: ${brief.artist}`);
      addParagraph(`Genre: ${brief.genre.join(', ')} | Mood: ${brief.mood.join(', ')} | Themes: ${brief.themes.join(', ')}`);
      if (crit) {
        addParagraph(`QA score: ${crit.score}/10 · Winner: ${crit.captionsWinner} (${crit.winnerReasons || '—'})`);
        if (crit.issues?.length) addBullets(crit.issues);
        if (crit.suggestions?.length) addBullets(crit.suggestions);
      }

      // Image attributions
      const attr = picks.map(s=> s.attribution).join('  •  ');
      setH(8, false, 120);
      addParagraph(attr.substring(0, 1200));
      setH(10, false, 20);

      doc.save(`${(brief.title || 'promo').replace(/\s+/g,'_')}_promo.pdf`);
    });
  });
}
