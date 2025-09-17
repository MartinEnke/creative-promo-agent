import { CreativeBrief } from "./types";


export function writeLoglines(b: CreativeBrief): string[] {
const g = b.genre[0];
const m = b.mood.join(" / ");
const t = b.themes.join(", ");
return [
`${b.title}: a ${g} cut that channels ${m}—all ${t}.`,
`A cinematic journey through ${t}, blending ${g} textures with ${m} energy.`,
`For fans of ${g} who crave ${m} moods and bold, modern production.`
];
}


export function writeBio120(b: CreativeBrief): string {
const base = `${b.artist ?? "The artist"} delivers ${b.genre[0]} steeped in ${b.mood[0]} atmosphere. ${b.title} paints ${b.themes[0] ?? "vivid scenes"} with layered synths, tactile drums, and a focused low end. Designed for late nights and bright lights, it balances intimacy and scale. Recommended for listeners who love detail, momentum, and a sense of place.`;
// Trim/expand to ≈120 words
return base;
}


export function writeCaptions(b: CreativeBrief): string[] {
const tag = hashtagBlock(b);
return [
`New drop: ${b.title} — ${b.mood[0]} ${b.genre[0]} textures. Link in bio. ${tag}`,
`${b.title} out now. Close your eyes; think ${b.themes.join(" • ")}. ${tag}`,
`Turn the city into a movie. ${b.title} is live. ${tag}`,
`Headphones on. ${b.title} is all ${b.mood.join(" / ")}. ${tag}`,
`File under ${b.genre[0]} / ${b.mood[0]}. Meet ${b.title}. ${tag}`
];
}


export function weekPlan(b: CreativeBrief): {day:string;idea:string;hook:string;}[] {
return [
{ day:"Mon", idea:"Teaser clip (10s)", hook:`What does ${b.title} feel like?`},
{ day:"Tue", idea:"Image carousel (moodboard)", hook:"Pick your favorite frame."},
{ day:"Wed", idea:"Behind-the-scenes (1 photo)", hook:"One decision that changed the mix."},
{ day:"Thu", idea:"Lyric/quote card", hook:"A line that sets the scene."},
{ day:"Fri", idea:"Release post (clean cover)", hook:"Out now — save it."},
{ day:"Sat", idea:"Story Q&A", hook:"Ask me anything about the track."},
{ day:"Sun", idea:"Fan-reshares / gratitude", hook:"Tag someone who needs this vibe."}
];
}


function hashtagBlock(b: CreativeBrief): string {
const base = ["music", ...b.genre.map(g=>g.replace(/\s+/g,'')), ...b.mood.map(m=>m.replace(/\s+/g,'')), "newmusic","producer","artist","nowplaying"]
.slice(0, 12)
.map(t=>`#${t}`).join(' ');
return base;
}