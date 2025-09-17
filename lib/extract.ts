import { CreativeBrief } from "./types";


const GENRES = ["synthwave","indie pop","techno","house","ambient","trap","drum & bass","metal","rock","jazz","classical","hip hop","lofi","electronic"];
const MOODS = ["moody","uplifting","cinematic","dark","warm","edgy","dreamy","energetic","melancholic","romantic","gritty","euphoric"];


function pickTone(moods: string[]): "cinematic"|"warm"|"edgy" {
if (moods.includes("cinematic")) return "cinematic";
if (moods.includes("warm")) return "warm";
return "edgy";
}


export async function briefFromLink(url: string): Promise<CreativeBrief> {
// YouTube oEmbed
const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
let title = "Untitled Track";
let artist = undefined as string | undefined;
try {
const res = await fetch(oembedUrl, { cache: 'no-store' });
if (res.ok) {
const data = await res.json();
title = data.title || title;
artist = data.author_name || undefined;
}
} catch {}


const lower = `${title}`.toLowerCase();
const foundGenres = GENRES.filter(g => lower.includes(g));
const foundMoods = MOODS.filter(m => lower.includes(m));


const genre = foundGenres.length ? foundGenres : ["electronic"];
const mood = foundMoods.length ? foundMoods : ["cinematic","moody"];


const themes = suggestThemes(genre, mood);
const tone = pickTone(mood);


return {
title,
artist,
genre,
mood,
themes,
targetAudience: `Fans of ${genre[0]} with ${mood[0]} vibes`,
tone,
colorHints: tone === 'cinematic' ? ["teal","magenta","midnight blue"] : tone === 'warm' ? ["amber","rose","cream"] : ["neon pink","acid green","ink black"]
};
}


export function briefFromText(text: string): CreativeBrief {
const lower = text.toLowerCase();
const genre = GENRES.filter(g => lower.includes(g)) || [];
const moods = MOODS.filter(m => lower.includes(m)) || [];
const themes = extractThemes(lower);
const mood = moods.length ? moods : ["cinematic"];
const g = genre.length ? genre : ["electronic"];
const tone = pickTone(mood);
return {
title: "New Release",
artist: undefined,
genre: g,
mood,
themes,
targetAudience: `Listeners into ${g[0]} and ${mood[0]} aesthetics`,
tone,
colorHints: tone === 'cinematic' ? ["teal","magenta","midnight blue"] : tone === 'warm' ? ["amber","rose","cream"] : ["neon pink","acid green","ink black"]
};
}


function extractThemes(t: string): string[] {
const hintWords = ["neon","city","dawn","ocean","forest","space","retro","futuristic","noir","sunset","rain","industrial","cyber","glitter","smoke","chrome","velvet"];
return hintWords.filter(w => t.includes(w)).slice(0,4);
}


function suggestThemes(genres: string[], moods: string[]): string[] {
if (genres.includes("synthwave")) return ["neon city","dawn","retro-futurism"];
if (moods.includes("warm")) return ["sunset","film grain","soft focus"];
if (moods.includes("edgy")) return ["noir","chrome","smoke"];
return ["wide landscapes","bokeh","twilight"];
}