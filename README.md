# SimFaceMD — AI Aesthetic Simulator

> See it before you do it. AI-powered facial aesthetic procedure preview for **Clinique Face MD**, Montréal.

A production-ready Next.js 14 app that lets prospective patients preview five common aesthetic procedures (Botox, lip filler, jawline filler, cheek filler, rhinoplasty) on their own photo using **fal.ai's FLUX.1 Kontext [pro]** image-to-image model.

The API key never touches the browser — all `fal.ai` calls go through a server-side `/api/simulate` route.

---

## ✨ Features

- 3-step mobile-first flow: **Choose → Photo → Simulate**
- Selfie capture (front camera) **or** photo upload, with graceful fallback
- Real AI image transformation via FLUX.1 Kontext [pro]
- Draggable before/after slider (mouse + touch)
- Brand-styled price estimates in CAD/USD
- One-tap booking & call buttons for Clinique Face MD

---

## 🚀 Local development

```bash
npm install
echo "FAL_KEY=your_fal_api_key_here" > .env.local
npm run dev
```

Open **http://localhost:3000**.

> The API route is in `app/api/simulate/route.ts`. It reads `FAL_KEY` from `process.env` only — the key is never sent to the browser.

---

## ☁️ Deploy to Vercel (5 minutes)

1. Push this folder to a GitHub repo (public or private).
2. Go to **vercel.com → New Project → Import** your repo. Vercel auto-detects Next.js — leave the build command as default.
3. **Settings → Environment Variables** → add:
   - `FAL_KEY` = `your_fal_api_key`
4. Click **Deploy**.

You'll have a live URL in ~60 seconds, and it works on any iPhone/Android.

To update later: push to your repo. Vercel rebuilds automatically.

---

## 🔑 Get a fal.ai API key

1. Go to **[fal.ai](https://fal.ai)** and sign up (free tier available).
2. Dashboard → **API Keys** → **Create new key**.
3. Copy the key into your Vercel environment variables.

---

## 💸 Cost per simulation

FLUX.1 Kontext [pro] runs ~**$0.04 USD per generated image** as of mid-2024. A clinic running 10 simulations/day costs roughly **$12/month**.

> Set a usage cap in your fal.ai dashboard to prevent surprises.

---

## 🗂 Project structure

```
simfacemd/
├── app/
│   ├── page.tsx                   ← All 4 screens (welcome / step1 / step2 / result)
│   ├── layout.tsx                 ← Fonts, metadata, viewport
│   ├── globals.css                ← Tokens, base styles, animations
│   └── api/
│       └── simulate/
│           └── route.ts           ← Server-side proxy to fal.ai (HIDES FAL_KEY)
├── .env.example                   ← Template for env vars
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── next.config.js
├── vercel.json
└── package.json
```

---

## 🎨 Design tokens

| Token         | Value                          |
| ------------- | ------------------------------ |
| Background    | `#000000`                      |
| Surface       | `#0D0D0D`                      |
| Surface 2     | `#141414`                      |
| Border        | `rgba(255,255,255,0.10)`       |
| Text          | `#FFFFFF`                      |
| Text muted    | `rgba(255,255,255,0.55)`       |
| Gold          | `#C9A84C`                      |
| Gold hover    | `#DFC06A`                      |
| Star          | `#F5A623`                      |
| Success       | `#5DB075`                      |
| Error         | `#E05252`                      |

Fonts: **Cormorant Garamond** (italic display) and **Inter** (body/UI), both via `next/font/google`.

---

## ⚖️ Disclaimer

Simulations are AI-generated previews and do not represent guaranteed medical outcomes. Final results vary and are determined during a consultation with a licensed practitioner.
