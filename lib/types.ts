export type UserInput =
| { type: "link"; url: string }
| { type: "brief"; text: string };


export type CreativeBrief = {
    title: string;
    artist: string;
    genre: string[];
    mood: string[];
    themes: string[];
    colorHints?: string[];
  
    // make these optional to avoid breaking older routes
    targetAudience?: string;
    tone?: string[]; // e.g., ['modern','credible']
  };



export type ImageRef = {
url: string;
thumb: string;
author: string;
source: "unsplash" | "pexels";
attribution: string;
};