# Setup guide

Everything here is free. No credit card is needed for any step.

## 1. Groq API key (most important; switches on the AI models)

1. Go to <https://console.groq.com> and sign in with Google or GitHub.
2. Open **API Keys** → **Create API Key** → give it a name (e.g. `sachcheck`) → copy the key (starts with `gsk_`).
3. Paste it into `.env.local` as `GROQ_API_KEY=gsk_...`

## 2. Google Fact Check Tools API key

1. Go to <https://console.cloud.google.com> and sign in.
2. Top bar → project picker → **New project** → name it `sachcheck` → Create.
3. Open <https://console.cloud.google.com/apis/library/factchecktools.googleapis.com> → make sure the new project is selected → **Enable**.
4. Left menu → **APIs & Services → Credentials** → **Create credentials → API key** → copy it.
5. (Recommended) Click the key → **API restrictions → Restrict key** → tick only **Fact Check Tools API** → Save.
6. Paste it into `.env.local` as `GOOGLE_FACTCHECK_API_KEY=...`
7. **Also switch on Google Safe Browsing** (used by the link checker; same project, same key): open <https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com> → **Enable**. If you restricted the key in step 5, edit the key and also tick **Safe Browsing API**. No new key or env var is needed.

## 3. Tavily key (optional, extra web search)

1. Go to <https://app.tavily.com> and sign up (the free plan includes monthly search credits).
2. Copy the API key from the dashboard (starts with `tvly-`).
3. Paste it into `.env.local` as `TAVILY_API_KEY=tvly-...`

## 4. Run and measure

```bash
npm run dev            # try it at http://localhost:3000
npm run eval:claims    # AI-mode score on the 50 test claims (takes ~5 minutes)
npm run eval:ocr       # adds the Groq vision score
```

## 5. Put it online (GitHub + Vercel)

1. Create an empty GitHub repository named `sach-check` (no README, no .gitignore).
2. In this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/sach-check.git
   git push -u origin main
   ```
3. Go to <https://vercel.com/new> → **Import** the `sach-check` repo → before clicking Deploy, open **Environment Variables** and add the same keys as in `.env.local` → **Deploy**.
4. Copy the live URL into the "Live demo" line at the top of `README.md`.

## 6. Telegram bot (optional)

1. In Telegram, open **@BotFather** → `/newbot` → choose a name and a username ending in `bot` → copy the token.
2. Make up a long random secret (e.g. 30+ letters and numbers).
3. Add both to `.env.local` **and** to Vercel's Environment Variables (then redeploy):
   `TELEGRAM_BOT_TOKEN=...` and `TELEGRAM_WEBHOOK_SECRET=...`
4. Connect the bot to your site:
   ```bash
   npm run telegram:webhook -- https://<your-app>.vercel.app
   ```
5. Send your bot a forward or an image.

## 7. Share from WhatsApp (Android)

1. Open the live site in Chrome on an Android phone → menu (⋮) → **Add to Home screen / Install app**.
2. Open the app once.
3. In WhatsApp, long-press a forward → **Share** → pick **SachCheck**.
