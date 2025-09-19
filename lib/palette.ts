// Client-side palette extraction helpers
export async function extractPalette(urls: string[], k = 5): Promise<string[]> {
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
  