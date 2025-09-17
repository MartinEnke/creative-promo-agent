# Requirements

- **Node.js 20 LTS** (recommended) and npm
- **Next.js 14** (already in `package.json`)
- Accounts & API keys:
  - **OpenAI** (`OPENAI_API_KEY`)
  - **Pexels** (`PEXELS_API_KEY`)
  - *(Optional)* **Unsplash** (`UNSPLASH_ACCESS_KEY`)

## Local setup

1. Install deps:
   ```bash
   npm install
   ```

2. Configure env:
   ```bash
   cp .env.example .env.local
   # then paste your real keys into .env.local
   ```

3. Run dev:
   ```bash
   npm run dev
   ```

> If your API routes can't see env vars, delete `.next/` and restart: `rm -rf .next && npm run dev`.
