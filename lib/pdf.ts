import { jsPDF as _jsPDF } from 'jspdf'; // for types only; we lazy import at runtime
import type { CreativeBrief, ImageRef } from '@/lib/types';
import { writeBio120, writeCaptions, writeLoglines, weekPlan } from '@/lib/ccopy';
import { roleColors, hexToRgb } from '@/lib/colors';

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
};
type Goal = 'pre_save' | 'pre_sale' | 'press_kit' | 'tiktok' | 'instagram' | 'playlist_pitch';

export function exportAsPDF({
  brief, selected, palette, ai, crit, goal
}: {
  brief: CreativeBrief;
  selected: ImageRef[];
  palette: string[];
  ai?: AIContent | null;
  crit?: Critique | null;
  goal: Goal;
}) {
  // Hard guard
  const guardReason =
    !brief ? 'Missing brief' :
    !Array.isArray(selected) || selected.length === 0 ? 'Select at least one image' :
    !Array.isArray(palette) || palette.length === 0 ? 'Palette not ready' :
    !ai ? 'Run “Execute Promo Agent” first' :
    '';
  if (guardReason) { console.warn('[exportAsPDF] blocked:', guardReason); return; }

  import('jspdf').then(({ default: jsPDF }) => {
    const roles = roleColors(palette);
    const pr = hexToRgb(roles.primary);
    const ac = hexToRgb(roles.accent);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = (doc as any).internal.pageSize.getWidth();
    const H = (doc as any).internal.pageSize.getHeight();
    const M = 40;
    const MAX = W - M * 2;
    let y = M;

    const SP = {
      sectionTop: 24,
      afterSectionHead: 14,
      groupTop: 16,
      afterGroupHead: 12,
      blockGap: 12,
      line: 14,
    };
    const vspace = (h = SP.blockGap) => { y += h; };

    const setH = (size=12, bold=false, color: number | {r:number;g:number;b:number} = 20) => {
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

    const sectionLabel = (text: string) => {
      vspace(SP.sectionTop);
      ensure(22);
      setH(11, true, pr);
      (doc as any).text(text.toUpperCase(), M, y);
      y += 6;
      line(M, y, W - M, y, pr);
      y += SP.afterSectionHead;
      setH(10, false, 20);
    };

    const addH2 = (t: string) => {
      vspace(SP.sectionTop);
      ensure(24);
      setH(12, true, pr);
      (doc as any).text(t, M, y);
      y += 6;
      line(M, y, W - M, y, ac);
      y += SP.afterSectionHead;
      setH(10, false, 20);
    };

    const groupHead = (title: string, badges: { text: string; tone: 'brand' | 'accent' | 'muted' }[] = []) => {
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
      y += SP.afterGroupHead;
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

    const twoColumnLists = (leftTitle:string, left:string[], rightTitle:string, right:string[]) => {
      const colGap = 14;
      const colW = (MAX - colGap) / 2;

      ensure(16);
      setH(10, false, 120);
      (doc as any).text(leftTitle, M, y);
      (doc as any).text(rightTitle, M + colW + colGap, y);
      y += 8; setH(10, false, 20);

      let yL = y, yR = y;

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
      y = Math.max(yL, yR) + 6;
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

      // Hooks
      groupHead(LOG_TITLE, [{ text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }]);
      addBullets(ai!.loglines ?? writeLoglines(brief), 6);

      // Bio
      groupHead('120-word Bio', [{ text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }]);
      addParagraph(ai!.bio120 ?? writeBio120(brief));

      // Captions
      const winner = crit?.captionsWinner ?? 'A';
      const reason = crit?.winnerReasons || '';
      const captionBadges: { text: string; tone: 'brand' | 'accent' | 'muted' }[] = [
        { text: hasAI ? 'AI' : 'Fallback', tone: 'brand' }
      ];
      if (crit) captionBadges.push({ text: 'QA', tone: 'accent' });
      groupHead('Captions (A/B)', captionBadges);

      vspace(6);
      if (ai && winner) {
        setH(10, false, 120);
        (doc as any).text(`Winner: ${winner}${reason ? ' — ' + reason : ''}`, M, y);
        vspace(20);
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

      const plan = ai!.plan ?? weekPlan(brief);
      plan.forEach(d=>{
        const lineTxt = `${d.day}: ${d.idea} — ${d.hook}`;
        const lines = (doc as any).splitTextToSize(lineTxt, MAX) as string[];
        lines.forEach(L=>{ ensure(SP.line); (doc as any).text(L, M, y); y += SP.line; });
      });

      // QA notes
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
      const attr = selected.slice(0,12).map(s=> s.attribution).join('  •  ');
      setH(8, false, 120);
      addParagraph(attr.substring(0, 1200));
      setH(10, false, 20);

      doc.save(`${(brief.title || 'promo').replace(/\s+/g,'_')}_promo.pdf`);
    });
  });
}
