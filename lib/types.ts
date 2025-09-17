export type UserInput =
| { type: "link"; url: string }
| { type: "brief"; text: string };


export type CreativeBrief = {
title: string;
artist?: string;
genre: string[];
mood: string[];
themes: string[];
targetAudience: string;
tone: "cinematic" | "warm" | "edgy";
colorHints: string[];
};


export type ImageRef = {
url: string;
thumb: string;
author: string;
source: "unsplash" | "pexels";
attribution: string;
};