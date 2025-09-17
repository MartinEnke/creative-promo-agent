# Creative Promo Agent

An AI-powered promo kit generator for music releases. Paste a track link or type metadata, curate 1–3 reference images, and the app generates:
- A tight **color palette** from your images
- **Loglines**, a **120-word bio**, **two caption sets (A/B)**, and a **7‑day plan**
- A **quality gate** (self-critique) that scores outputs and picks the better caption set
- A styled **PDF export** (palette → moodboard → content → appendix)

## Stack
- **Next.js 14** (App Router)
- **OpenAI** `gpt-4o-mini` (compose + critique)
- **Pexels** / **Unsplash** (image search)
- **jsPDF** (export)
- Tailwind-style utility classes

## Quick start

```bash
npm install
cp .env.example .env.local
# paste your real API keys into .env.local
npm run dev
```

Visit **http://localhost:3000**, use **Try a demo** or fill the brief, curate images, then click **Execute Promo Agent**.

## Environment variables

Create `.env.local` from `.env.example`:

```
PEXELS_API_KEY=your_pexels_key_here
UNSPLASH_ACCESS_KEY=           # optional
OPENAI_API_KEY=your_openai_key_here
```

> Never commit `.env.local`. The repo tracks `.env.example` for reference.

## Useful npm scripts
- `npm run dev` — start Next.js dev server
- `npm run build` — production build
- `npm start` — run production server (after build)

## API routes overview
- `POST /api/ingest` — oEmbed metadata from a track link
- `GET  /api/images` — image search proxy (Pexels/Unsplash)
- `POST /api/compose` — AI composition (A/B captions + cache + telemetry)
- `POST /api/critique` — AI quality gate (score, issues, suggestions, winner)

## Deploy notes
- Set env vars in your host (Vercel/Render/etc.).
- Ensure API routes run on **Node runtime** (we export `runtime = 'nodejs'`).
- Consider removing the dev-only `/api/debug-env` route before deployment.

## Troubleshooting
- **Missing API key**: ensure `.env.local` is at the project root and restart the dev server.
- **Images return 400**: you likely don’t have Pexels/Unsplash keys loaded. Check `/api/debug-env` (dev only).
- **Edge runtime env issues**: our API routes force Node, but double‑check you didn’t set `runtime = 'edge'` elsewhere.

---

© 2025 Martin Enke. MIT License.
