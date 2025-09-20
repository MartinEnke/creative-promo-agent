// export.ts
import { CreativeBrief } from "./types";

const GENRES = [
  "synthwave", "indie pop", "techno", "house", "ambient", "trap", "drum & bass",
  "metal", "rock", "jazz", "classical", "hip hop", "lofi", "electronic"
];

const MOODS = [
  "moody", "uplifting", "cinematic", "dark", "warm", "edgy", "dreamy",
  "energetic", "melancholic", "romantic", "gritty", "euphoric"
];

/** Always derive a single tone string internally. */
function deriveToneString(moods: string[]): "cinematic" | "warm" | "edgy" {
  if (moods.includes("cinematic")) return "cinematic";
  if (moods.includes("warm")) return "warm";
  return "edgy";
}

/** Accept whatever your CreativeBrief['tone'] is (string or string[]) and return color hints. */
function toneToColors(tone: CreativeBrief["tone"]): string[] {
  const t = Array.isArray(tone) ? (tone[0] ?? "") : (tone ?? "");
  switch (t) {
    case "cinematic": return ["teal", "magenta", "midnight blue"];
    case "warm":      return ["amber", "rose", "cream"];
    default:          return ["neon pink", "acid green", "ink black"]; // edgy / fallback
  }
}

/** Turn a single tone string into whatever the brief expects (string or string[]). */
function toBriefTone(t: string): CreativeBrief["tone"] {
  // Casting via unknown lets this satisfy both `string` and `string[]` schemas cleanly.
  return ([t] as unknown) as CreativeBrief["tone"];
}

function extractThemes(t: string): string[] {
  const hintWords = [
    "neon","city","dawn","ocean","forest","space","retro","futuristic","noir",
    "sunset","rain","industrial","cyber","glitter","smoke","chrome","velvet"
  ];
  const lower = (t || "").toLowerCase();
  return hintWords.filter(w => lower.includes(w)).slice(0, 4);
}

function suggestThemes(genres: string[], moods: string[]): string[] {
  if (genres.includes("synthwave")) return ["neon city", "dawn", "retro-futurism"];
  if (moods.includes("warm"))      return ["sunset", "film grain", "soft focus"];
  if (moods.includes("edgy"))      return ["noir", "chrome", "smoke"];
  return ["wide landscapes", "bokeh", "twilight"];
}

function toAudience(genre: string[], mood: string[]): string {
  const g = genre[0] ?? "electronic";
  const m = mood[0]  ?? "cinematic";
  return `Listeners into ${g} and ${m} aesthetics`;
}

/**
 * Build a CreativeBrief from a media link (e.g., YouTube oEmbed).
 * Falls back to safe defaults if fetch fails.
 */
export async function briefFromLink(url: string): Promise<CreativeBrief> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  let title = "Untitled Track";
  let artistRaw: string | undefined;

  try {
    const res = await fetch(oembedUrl, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      title     = (data?.title as string) || title;
      artistRaw = (data?.author_name as string) || undefined;
    }
  } catch {
    // ignore network/oEmbed issues; keep defaults
  }

  const lower = (title || "").toLowerCase();
  const foundGenres = GENRES.filter(g => lower.includes(g));
  const foundMoods  = MOODS.filter(m => lower.includes(m));

  const genre  = foundGenres.length ? foundGenres : ["electronic"];
  const mood   = foundMoods.length  ? foundMoods  : ["cinematic", "moody"];
  const themes = suggestThemes(genre, mood);

  const toneStr = deriveToneString(mood);
  const tone    = toBriefTone(toneStr);
  const colorHints = toneToColors(tone);
  const targetAudience = toAudience(genre, mood);

  const brief: CreativeBrief = {
    title: (title ?? "Untitled").trim() || "Untitled",
    artist: (artistRaw ?? "").trim(),   // never undefined
    genre,
    mood,
    themes,
    tone,           // matches your schema (string or string[])
    targetAudience, // required by your types
    colorHints,     // suggested from tone
  };

  return brief;
}

/**
 * Build a CreativeBrief from free text.
 */
export function briefFromText(text: string): CreativeBrief {
  const lower = (text || "").toLowerCase();

  const genreHits = GENRES.filter(g => lower.includes(g));
  const moodHits  = MOODS.filter(m => lower.includes(m));

  const genre  = genreHits.length ? genreHits : ["electronic"];
  const mood   = moodHits.length  ? moodHits  : ["cinematic"];
  const themes = extractThemes(lower);

  const toneStr = deriveToneString(mood);
  const tone    = toBriefTone(toneStr);
  const colorHints = toneToColors(tone);
  const targetAudience = toAudience(genre, mood);

  return {
    title: "New Release",
    artist: "",   // keep empty string instead of undefined
    genre,
    mood,
    themes,
    tone,
    targetAudience,
    colorHints,
  };
}
