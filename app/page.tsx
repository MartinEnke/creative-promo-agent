'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { CreativeBrief, ImageRef, UserInput } from '@/lib/types';
import { writeBio120, writeCaptions, writeLoglines, weekPlan } from '@/lib/ccopy';

function cx(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' '); }
function toList(s: string): string[] { return (s || '').split(/[|,/•·]+/).map(x => x.trim()).filter(Boolean); }

type Orientation = 'auto' | 'landscape' | 'portrait' | 'square';
type Goal = 'pre_save' | 'press_kit' | 'tiktok' | 'playlist_pitch';

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

  // --- UI state ---
  const [linkLoading, setLinkLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [critLoading, setCritLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  // --- AI content + critique ---
  const [ai, setAi] = useState<AIContent | null>(null);
  const [crit, setCrit] = useState<Critique | null>(null);

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
    setGoal('pre_save');
    await searchImages('neon city rain 2 AM streets', 'portrait');
    setTimeout(() => {
      const picks = images.slice(0, 2);
      setSelected(picks);
      extractPalette(picks.map(p => p.thumb)).then(setPalette);
      setTimeout(() => handleExecute(), 250);
    }, 250);
  }

  // Curate images directly from THEMES (+ orientation)
  async function curateFromThemes() {
    const q = toList(themesStr).join(' ');
    if (!q) { setMsg('Add a few themes first (e.g., neon city, rain).'); return; }
    await searchImages(q, orientation);
  }

  async function searchImages(query: string, orient: Orientation) {
    setImgLoading(true); setMsg(null);
    setSelected([]); setPalette([]); setExecuted(false); setAi(null); setCrit(null);
    const url = '/api/images?count=12&orientation=' + orient + '&query=' + encodeURIComponent(query);
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) {
      const detail = typeof j.error === 'string' ? j.error : [j.error.provider, j.error.status, j.error.body].filter(Boolean).join(' • ');
      setImages([]); setMsg('Image search failed: ' + detail);
    } else if (!j.images || j.images.length === 0) {
      setImages([]); setMsg('No images found for this query. Try simpler terms.');
    } else {
      setImages(j.images);
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
      // Compose (A/B captions)
      const t0 = performance.now();
      const rc = await fetch('/api/compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: workingBrief, palette, goal }),
      });
      const j = await rc.json();
      if (j.error) throw new Error(j.error);
      const composeMs = performance.now() - t0;
      setAi({ ...j, tookMs: j.tookMs ?? Math.round(composeMs) });

      // Critique + choose winner
      setCritLoading(true);
      const t1 = performance.now();
      const rr = await fetch('/api/critique', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: workingBrief, goal, draft: j }),
      });
      const c = await rr.json();
      const critMs = performance.now() - t1;
      if (c.error) throw new Error(c.error);
      setCrit({ ...c, tookMs: c.tookMs ?? Math.round(critMs) });

      // If low score, auto-refine once
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

  function exportPDF() {
    exportAsPDF({ brief: workingBrief, selected, palette, ai, crit, goal });
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Creative Promo Agent</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={runDemo}>Try a demo</button>
          <button className="btn-primary" onClick={exportPDF} disabled={!palette.length || !selected.length}>
            Export PDF
          </button>
        </div>
      </header>

      <section className="grid md:grid-cols-3 gap-6">
        {/* LEFT */}
        <div className="md:col-span-1 space-y-4">
          <div className="card space-y-3">
            <h3 className="font-semibold">Brief</h3>

            {/* Goal preset */}
            <div className="space-y-2">
              <label className="label">Goal</label>
              <select className="input !py-2 !h-auto" value={goal} onChange={e=>setGoal(e.target.value as Goal)}>
                <option value="pre_save">Pre-save push</option>
                <option value="press_kit">Press kit</option>
                <option value="tiktok">TikTok launch</option>
                <option value="playlist_pitch">Playlist pitch</option>
              </select>
            </div>

            {/* Link helper */}
            <div className="space-y-2">
              <label className="label">Track link (YouTube/Spotify/SoundCloud)</label>
              <input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…" className="input"/>
              <div className="flex items-center gap-2">
                <button className="btn-secondary" onClick={fetchFromLink} disabled={linkLoading || !link.trim()}>
                  {linkLoading ? 'Fetching…' : 'OK'}
                </button>
                <p className="text-[11px] text-gray-500">We’ll auto-fill Title/Artist; you can edit.</p>
              </div>
            </div>

            {/* Metadata */}
            <h4 className="font-medium pt-1">Track metadata</h4>
            <div className="space-y-2">
              <label className="label">Title</label>
              <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Untitled"/>
            </div>
            <div className="space-y-2">
              <label className="label">Artist</label>
              <input className="input" value={artist} onChange={e=>setArtist(e.target.value)} placeholder="Your artist name"/>
            </div>
            <div className="space-y-2">
              <label className="label">Genre (comma-separated)</label>
              <input className="input" value={genreStr} onChange={e=>setGenreStr(e.target.value)} placeholder="e.g., synthwave, indie pop"/>
            </div>

            {/* Creative direction */}
            <h4 className="font-medium pt-1">Creative direction</h4>
            <div className="space-y-2">
              <label className="label">Mood (comma-separated)</label>
              <input className="input" value={moodStr} onChange={e=>setMoodStr(e.target.value)} placeholder="e.g., nocturnal, euphoric"/>
            </div>
            <div className="space-y-2">
              <label className="label">Themes (comma-separated, visual)</label>
              <input className="input" value={themesStr} onChange={e=>setThemesStr(e.target.value)} placeholder="e.g., neon city, rain, 2 AM streets"/>
              <div className="flex items-center gap-2">
                <select className="input !py-2 !h-auto w-40" value={orientation} onChange={e => setOrientation(e.target.value as Orientation)} title="Image orientation">
                  <option value="auto">Orientation: Auto</option>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
                <button className="btn-secondary flex-1" onClick={curateFromThemes} disabled={imgLoading}>
                  {imgLoading ? 'Searching…' : 'Curate images'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">Themes drive visuals (what to look for in images).</p>
            </div>

            {msg && <p className="text-xs text-red-500">{msg}</p>}
          </div>

          <PaletteBlock palette={palette} />

          {/* Run details */}
          {(ai || crit) && (
            <div className="card text-xs space-y-1">
              <h4 className="font-semibold mb-1">Run details</h4>
              {ai && (
                <p>Compose: {ai.tookMs ?? '—'} ms · {ai.model} · tokens: {ai.usage?.total_tokens ?? '—'} {ai.cache ? '· cache' : ''}</p>
              )}
              {crit && (
                <p>Critique: {crit.tookMs ?? '—'} ms · {crit.model} · tokens: {crit.usage?.total_tokens ?? '—'} · score: {crit.score ?? '—'}</p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="md:col-span-2 space-y-4">
          <div className="card">
            {/* Tips + Selected + Execute */}
            <div className="mb-3 space-y-1">
              <p className="text-xs text-gray-600">
                <strong>Pick 1–3 images</strong> for a clean, focused palette. Image attribution is included in the PDF.
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">Selected: {selected.length} (max 12). Click again to deselect.</p>
                <button className="btn-primary" onClick={handleExecute} disabled={selected.length === 0 || !palette.length || aiLoading || critLoading}>
                  {(aiLoading || critLoading) ? 'Generating…' : 'Execute Promo Agent'}
                </button>
              </div>
            </div>

            {/* Fixed 3×4 grid */}
            {images.length === 0 ? (
              <p className="text-sm text-gray-500">Add themes and hit “Curate images” to see suggestions.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {images.slice(0, 12).map((img, i) => (
                  <button
                    key={i}
                    onClick={() => toggle(img)}
                    className={cx('relative border rounded-xl overflow-hidden w-full pb-[75%]', selected.find((s) => s.url === img.url) && 'ring-2 ring-brand-500')}
                    title={img.attribution}
                  >
                    <img src={img.thumb} alt="ref" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute bottom-0 inset-x-0 text-[10px] bg-black/50 text-white p-1">{img.author}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          {executed && (palette.length > 0) && (
            <CopyPanel brief={workingBrief} ai={ai} crit={crit} />
          )}
        </div>
      </section>

      <footer className="text-xs text-gray-500">{/* empty */}</footer>
    </div>
  );
}

/* ---------- Copy Panel (A/B + winner, critique badges) ---------- */
function CopyPanel({ brief, ai, crit }: { brief: CreativeBrief; ai: AIContent | null; crit: Critique | null }) {
  const winner = crit?.captionsWinner ?? 'A';
  const captions = ai ? (winner === 'A' ? ai.captionsA : ai.captionsB) : writeCaptions(brief);
  const logs = ai?.loglines ?? useMemo(()=> writeLoglines(brief), [brief]);
  const bio  = ai?.bio120  ?? useMemo(()=> writeBio120(brief), [brief]);
  const plan = ai?.plan ?? useMemo(()=> weekPlan(brief), [brief]);

  return (
    <div className="card grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <h3 className="font-semibold">Content {crit ? <span className="text-xs text-green-600">• QA score {crit.score}/10</span> : null}</h3>
        <h4 className="font-medium">Loglines {ai ? <span className="text-xs text-green-600">• AI</span> : <span className="text-xs text-gray-400">• fallback</span>}</h4>
        <ul className="list-disc pl-5 text-sm space-y-1">{logs.map((l,i)=>(<li key={i}>{l}</li>))}</ul>

        <h4 className="font-medium mt-4">120-word Bio {ai ? <span className="text-xs text-green-600">• AI</span> : <span className="text-xs text-gray-400">• fallback</span>}</h4>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{bio}</p>
      </div>
      <div className="space-y-2">
        <h4 className="font-medium">Captions (A/B)</h4>
        {ai ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={cx('text-xs mb-1', crit?.captionsWinner==='A' ? 'text-green-600 font-medium' : 'text-gray-500')}>Set A {crit?.captionsWinner==='A' && '• Winner'}</div>
              <ul className="list-disc pl-5 text-sm space-y-1">{ai.captionsA.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
            </div>
            <div>
              <div className={cx('text-xs mb-1', crit?.captionsWinner==='B' ? 'text-green-600 font-medium' : 'text-gray-500')}>Set B {crit?.captionsWinner==='B' && '• Winner'}</div>
              <ul className="list-disc pl-5 text-sm space-y-1">{ai.captionsB.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
            </div>
          </div>
        ) : (
          <ul className="list-disc pl-5 text-sm space-y-1">{captions.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
        )}
        {crit?.winnerReasons && <p className="text-xs text-gray-500 mt-1">Why: {crit.winnerReasons}</p>}

        <h4 className="font-medium mt-4">7-Day Plan</h4>
        <ul className="text-sm space-y-1">
          {plan.map((d,i)=>(<li key={i}><span className="font-medium">{d.day}:</span> {d.idea} — <em className="text-gray-500">{d.hook}</em></li>))}
        </ul>

        {crit?.issues?.length ? (
          <div className="mt-3 rounded-lg bg-yellow-50 border p-2 text-xs">
            <div className="font-medium">Referee notes</div>
            <ul className="list-disc pl-4">{crit.issues.map((i,idx)=>(<li key={idx}>{i}</li>))}</ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Palette block ---------- */
function PaletteBlock({ palette }: { palette: string[] }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-2">Color Palette</h3>
      {palette.length === 0 ? (
        <p className="text-sm text-gray-500">Select 1–3 images and we’ll extract a 5-color palette.</p>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          {palette.map((hex,i)=>(
            <div key={i} className="rounded-xl h-12 border border-black/5 relative" style={{ background: hex }}>
              <span className="absolute bottom-1 left-1 text-[10px] bg-white/70 px-1 rounded">{hex}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Palette extraction ---------- */
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

/* ---------- Color helpers ---------- */
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

/* ---------- PDF export (no assets) ---------- */
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
  if (!brief) return;
  import('jspdf').then(({ default: jsPDF }) => {
    const roles = roleColors(palette);
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const W = (doc as any).internal.pageSize.getWidth();
    const H = (doc as any).internal.pageSize.getHeight();
    const M = 40, MAX = W - M*2, LH = 14;
    let y = M;

    const pr = hexToRgb(roles.primary);
    const ac = hexToRgb(roles.accent);
    const ensure = (need=0)=>{ if (y+need > H-M){ doc.addPage(); y = M; } };
    const addH2 = (t:string)=>{ ensure(LH*2);
      // @ts-ignore
      doc.setTextColor(pr.r,pr.g,pr.b);
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(t,M,y);
      y+=6; // @ts-ignore
      doc.setDrawColor(ac.r,ac.g,ac.b); doc.setLineWidth(1); doc.line(M,y,W-M,y); y+=10;
      doc.setTextColor(20); doc.setFont('helvetica','normal'); doc.setFontSize(10);
    };
    const addParagraph = (t:string)=>{ if(!t) return; const lines=(doc as any).splitTextToSize(t,MAX) as string[];
      for(const line of lines){ ensure(LH); doc.text(line,M,y); y+=LH; } y+=4; };
    const addBullets=(arr:string[],max=arr.length)=>{ for(const it of arr.slice(0,max)){ const lines=(doc as any).splitTextToSize('• '+it,MAX) as string[];
      for(const l of lines){ ensure(LH); doc.text(l,M,y); y+=LH; } } y+=4; };

    // Title + divider + meta
    // @ts-ignore
    doc.setTextColor(pr.r,pr.g,pr.b);
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('Creative Promo – ' + (brief.title || 'Untitled'), M, y);
    doc.setTextColor(20);
    y += 12; // @ts-ignore
    doc.setDrawColor(ac.r,ac.g,ac.b); doc.setLineWidth(2); doc.line(M,y,W-M,y);
    y += 16;
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text(`Artist: ${brief.artist || '—'}  |  Goal: ${goal}  |  Genre: ${(brief.genre||[]).join(', ') || '—'}  |  Mood: ${(brief.mood||[]).join(', ') || '—'}  |  Themes: ${(brief.themes||[]).join(', ') || '—'}`, M, y, { maxWidth: MAX });

    // Palette
    y += 24; addH2('Palette');
    const sw=24, gap=8; ensure(sw+8);
    palette.forEach((hex,i)=>{ const x=M+i*(sw+gap); const c=hexToRgb(hex);
      // @ts-ignore
      doc.setFillColor(c.r,c.g,c.b); doc.rect(x,y,sw,sw,'F'); doc.setDrawColor(200); doc.rect(x,y,sw,sw); });
    y += sw + 12;

    // Moodboard
    addH2('Moodboard');
    const cols=4, iw=120, ih=80, ig=10;
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
      y = startY + gridHeight + 14;

      // Content
      addH2('Content');
      const logs = ai?.loglines ?? writeLoglines(brief);
      const bio  = ai?.bio120  ?? writeBio120(brief);
      const winner = crit?.captionsWinner ?? 'A';
      const captions = ai ? (winner==='A' ? ai.captionsA : ai.captionsB) : writeCaptions(brief);
      const plan = ai?.plan ?? weekPlan(brief);

      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Loglines', M, y); y+=8;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); addBullets(logs, 5);

      doc.setFont('helvetica','bold'); doc.setFontSize(11); ensure(LH*2); doc.text('120-word Bio', M, y); y+=8;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); addParagraph(bio);

      doc.setFont('helvetica','bold'); doc.setFontSize(11); ensure(LH*2); doc.text(`Captions (${winner})`, M, y); y+=8;
      doc.setFont('helvetica','normal'); doc.setFontSize(10); addBullets(captions, 6);

      doc.setFont('helvetica','bold'); doc.setFontSize(11); ensure(LH*2); doc.text('7-Day Plan', M, y); y+=8;
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      for (const d of plan){ const line=`${d.day}: ${d.idea} — ${d.hook}`; const lines=(doc as any).splitTextToSize(line,MAX) as string[];
        for (const l of lines){ ensure(LH); doc.text(l,M,y); y+=LH; } } y+=6;

      // Appendix: inputs & QA
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

      const attr = picks.map(s=> s.attribution).join('  •  ');
      doc.setFontSize(8); doc.setTextColor(120);
      addParagraph(attr.substring(0, 1000)); doc.setTextColor(20);

      doc.save(`${(brief.title || 'promo').replace(/\s+/g,'_')}_promo.pdf`);
    });
  });
}
