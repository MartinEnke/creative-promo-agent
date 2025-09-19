export function roleColors(palette: string[]) {
    if (!palette.length) return { primary: '#5468ff', accent: '#ff4d6d', neutral: '#111827' };
    const withL = palette.map(hex => { const { h, s, l } = hexToHsl(hex); return { hex, h, s, l }; });
    const primary = withL.filter(c => c.l > 0.25 && c.l < 0.75)
      .sort((a,b)=> (b.s - a.s) || Math.abs(0.5-b.l) - Math.abs(0.5-a.l))[0]?.hex || palette[0];
    const ph = hexToHsl(primary).h;
    const accent = withL.sort((a,b)=> hueDistance(b.h, ph) - hueDistance(a.h, ph))[0]?.hex || palette[1] || primary;
    const neutral = withL.sort((a,b)=> a.l - b.l)[0]?.hex || '#111827';
    return { primary, accent, neutral };
  }
  
  export function hexToRgb(hex: string){
    const v = parseInt(hex.slice(1),16);
    return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
  }
  
  export function hexToHsl(hex: string) {
    const { r,g,b } = hexToRgb(hex);
    const r1=r/255, g1=g/255, b1=b/255;
    const max=Math.max(r1,g1,b1), min=Math.min(r1,g1,b1);
    let h=0,s=0,l=(max+min)/2;
    const d=max-min;
    if(d!==0){
      s = l>0.5 ? d/(2-max-min) : d/(max+min);
      switch(max){
        case r1: h=(g1-b1)/d + (g1<b1?6:0); break;
        case g1: h=(b1-r1)/d + 2; break;
        default: h=(r1-g1)/d + 4; break;
      }
      h/=6;
    }
    return { h, s, l };
  }
  
  export function hueDistance(a:number,b:number){ const d=Math.abs(a-b); return Math.min(d,1-d); }
  