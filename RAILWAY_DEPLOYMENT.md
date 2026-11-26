# Deploying ZeVox SaaS to Railway

This guide walks through deploying `sn-voice-saas` (the ZeVox dashboard) to [Railway](https://railway.app). The Dockerfile, `railway.json`, and `.dockerignore` are already in place.

**Live deployment:** https://zevox.up.railway.app

> **Note on architecture:** ZeVox spans three repos. This deployment is **only for `sn-voice-saas`** (the Next.js dashboard + WebSocket voice pipeline). The `voice-gateway` repo deploys separately to Fly.io. The `AI_Voice_Agent` repo is a ServiceNow scoped app and does not deploy to Railway.

---

## Why Railway works for this project

- **Dockerfile-based deployment** — Railway will use the existing multi-stage `Dockerfile` exactly as written
- **WebSocket support** — Railway proxies WebSocket connections out of the box, required for the `/voice` endpoint in `server.ts`
- **Managed Postgres** — Railway provides a Postgres add-on that auto-injects `DATABASE_URL`
- **Custom server.ts is supported** — `npx tsx server.ts` runs as the start command (no standalone Next.js build needed)
- **Free tier** — $5/month of compute credit covers small-traffic deployments

---

## Prerequisites

1. A [Railway account](https://railway.app) (free)
2. A GitHub account with `sn-voice-saas` pushed to a repo
3. The following accounts set up and ready (so you have keys to paste):
   - **Google OAuth** — `console.cloud.google.com` → Credentials → OAuth client (Web)
   - **GitHub OAuth** (optional) — `github.com/settings/developers` → New OAuth App
   - **Deepgram** — `console.deepgram.com` ($200 free credit)
   - **RevenueCat** (optional, for billing) — `app.revenuecat.com`

---

## Step 1 — Push to GitHub

If `sn-voice-saas` isn't already on GitHub:

```bash
cd /Users/sagarpinninti/Desktop/SN/sn-voice-saas
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/sn-voice-saas.git
git push -u origin main
```

> The `.gitignore` already excludes `.env*`, so your secrets won't leak.

---

## Step 2 — Create the Railway project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **Deploy from GitHub repo**
3. Authorize Railway to access your repos (first time only)
4. Select `sn-voice-saas`
5. Railway detects the `Dockerfile` automatically and starts the first build (it will fail until env vars are set — that's expected)

---

## Step 3 — Add Postgres

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway provisions a Postgres instance and creates a `DATABASE_URL` environment variable in the database service
3. **Reference it from your app service:**
   - Click your `sn-voice-saas` service → **Variables** tab
   - Click **+ New Variable** → **Add Reference**
   - Select the Postgres service → `DATABASE_URL`
   - This injects the connection string into your app at deploy time

---

## Step 4 — Set environment variables

In your `sn-voice-saas` service → **Variables** tab, add the following. Use **Raw Editor** for bulk paste:

```env
# NextAuth — generate a secret with: openssl rand -base64 32
NEXTAUTH_SECRET=<paste 32-byte base64 string>
NEXTAUTH_URL=https://<your-railway-domain>.up.railway.app

# Google OAuth
GOOGLE_CLIENT_ID=<from console.cloud.google.com>
GOOGLE_CLIENT_SECRET=<from console.cloud.google.com>

# GitHub OAuth (optional — leave empty to disable)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Deepgram (handles both STT Nova-3 and TTS Aura)
DEEPGRAM_API_KEY=<from console.deepgram.com>

# RevenueCat (optional — leave empty to disable billing)
NEXT_PUBLIC_REVENUECAT_API_KEY=
REVENUECAT_API_KEY=
REVENUECAT_WEBHOOK_SECRET=

# App URLs
NEXT_PUBLIC_APP_URL=https://<your-railway-domain>.up.railway.app
NEXT_PUBLIC_APP_NAME=ZeVox

# Admin emails (comma-separated, can access /admin)
ADMIN_EMAILS=your@email.com

# Production
NODE_ENV=production
```

> **Important:** `DATABASE_URL` should NOT be set manually — it's auto-injected from the Postgres reference (Step 3). Adding it manually will conflict.

> **Important:** `PORT` should NOT be set manually. Railway injects its own `PORT` value. The server reads it via `process.env.PORT || '3000'`.

---

## Step 5 — Generate the public domain

1. In your `sn-voice-saas` service → **Settings** → **Networking**
2. Click **Generate Domain**
3. Copy the generated domain (e.g. `sn-voice-saas-production.up.railway.app`)
4. **Update env vars** with this domain:
   - `NEXTAUTH_URL` = `https://<that-domain>`
   - `NEXT_PUBLIC_APP_URL` = `https://<that-domain>`
5. **Update Google OAuth callback URL** in `console.cloud.google.com`:
   - Add `https://<that-domain>/api/auth/callback/google` to authorized redirect URIs

---

## Step 6 — Run database migrations

The Dockerfile runs `npx prisma generate` at build time, but it does NOT run migrations. You need to push the schema once after the first successful deploy.

Two options:

**Option A — One-time migration via Railway CLI**

```bash
# Install CLI
npm i -g @railway/cli

# Login + link to your project
railway login
railway link

# Run prisma db push against the deployed database
railway run npx prisma db push
```

**Option B — Add migration to the start command** (alternative — edit `railway.json`)

Change `startCommand` to:
```
"startCommand": "npx prisma db push && npx tsx server.ts"
```

> Use `db push` for the initial schema. Switch to `prisma migrate deploy` once you have proper migration files. Don't add `--accept-data-loss`: without it, `db push` stops instead of making a destructive schema change.

---

## Step 7 — Verify the deployment

1. Open `https://<your-domain>` — you should see the landing page
2. Click **Sign in** → log in with Google
3. You should be redirected to `/dashboard` and see the new Resonance-styled UI (sidebar with token-driven colors, Card primitives, etc.)
4. Test the WebSocket voice pipeline at `wss://<your-domain>/voice?token=<your-api-token>`

---

## Step 8 — (Optional) Custom domain

1. Service → **Settings** → **Networking** → **Custom Domain**
2. Add your domain (e.g. `app.zevox.io`)
3. Add the CNAME record Railway shows you to your DNS provider
4. Wait for SSL provisioning (~1-5 min)
5. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the custom domain
6. Update Google OAuth redirect URIs to the custom domain

---

## Cost estimate

| Tier | Setup | Monthly cost |
|---|---|---|
| **Hobby / dev** | Free Railway tier ($5 credit/mo) + Neon free Postgres + Deepgram free credit + Groq free LLM | **$0** |
| **Small production** | Railway Hobby (~$5-15/mo for app + DB) + paid Deepgram (~$0.46/hr conversation) + Groq paid (~$5/mo) | **~$15-30/mo + usage** |
| **Scale** | Railway Pro (~$20+/mo) + dedicated Postgres + LLM tokens + STT/TTS minutes | **~$50-200+/mo** depending on traffic |

Railway's free $5/mo credit is enough for low-traffic dev + pilot if you keep the service warm-but-idle.

---

## Troubleshooting

**Build fails on `prisma generate`**
The schema file references `env("DATABASE_URL")`, but `prisma generate` doesn't need the DB to be reachable — it only needs the schema file. If this fails, check that `prisma/schema.prisma` is included in the build context (it is, per the Dockerfile).

**Build succeeds but app crashes on start**
Check the logs: most common cause is missing env vars. `NEXTAUTH_SECRET` and `DATABASE_URL` are required for the app to even start.

**Google sign-in redirects to localhost**
You forgot to update `NEXTAUTH_URL` after generating the Railway domain. The OAuth callback uses `NEXTAUTH_URL` to build the redirect URI.

**WebSocket connection fails**
Check the browser console for the `wss://` URL. It should match your Railway domain. If you see CORS errors, the `widget.js` route in `server.ts` already sets `Access-Control-Allow-Origin: *` — but check that the request is going to the right host.

**`tsx` not found at runtime**
The server runs with `npx tsx server.ts`. `tsx` is listed in `dependencies`, so `npm ci` installs it during the image build.

**Database schema isn't applied**
You skipped Step 6. Run `railway run npx prisma db push` once, then redeploy.

---

## What's NOT covered here

- **Pushing to GitHub** — that's a manual step, but the `.gitignore` is correct
- **Actually deploying** — you must run the steps above with your real accounts and keys
- **The `voice-gateway` repo** — that deploys separately to Fly.io, see its own `fly.toml`
- **The `AI_Voice_Agent` SN scoped app** — that deploys to a ServiceNow instance via the SN SDK, not to Railway
