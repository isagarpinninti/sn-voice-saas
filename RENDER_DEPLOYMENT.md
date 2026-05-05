# Deploying ZeVox SaaS to Render

This guide walks through deploying `sn-voice-saas` to [Render](https://render.com). The `Dockerfile` and `render.yaml` Blueprint are already in place.

---

## Prerequisites

1. A [Render account](https://render.com) (free)
2. `sn-voice-saas` pushed to a GitHub or GitLab repo
3. Keys ready to paste:
   - **Google OAuth** — `console.cloud.google.com` → Credentials → OAuth 2.0 Client (Web)
   - **GitHub OAuth** (optional) — `github.com/settings/developers` → New OAuth App
   - **Deepgram** — `console.deepgram.com` ($200 free credit on sign-up)
   - **RevenueCat** (optional, for billing) — `app.revenuecat.com`

---

## Step 1 — Push to GitHub

```bash
cd /path/to/sn-voice-saas
git add .
git commit -m "Add Render deployment config"
git push
```

The `.gitignore` already excludes `.env*` so your secrets won't leak.

---

## Step 2 — Deploy via Blueprint (render.yaml)

1. Go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)
2. Click **New Blueprint Instance**
3. Connect your GitHub account and select the `sn-voice-saas` repo
4. Render reads `render.yaml` and shows you a preview:
   - `sn-voice-saas` — Web Service (Docker, Starter plan)
   - `sn-voice-saas-db` — PostgreSQL (free)
5. Click **Apply** — Render provisions the DB and starts the first build

> The first build will take 5–10 minutes (Docker multi-stage build). It's expected to fail until you fill in secrets (Step 3).

---

## Step 3 — Fill in secrets

After the Blueprint is created, open the `sn-voice-saas` web service → **Environment** tab.

Variables marked `sync: false` in `render.yaml` are placeholders — you must set them here:

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` | GCP Console → Credentials → your OAuth client |
| `GOOGLE_CLIENT_SECRET` | Same page |
| `GITHUB_CLIENT_ID` | github.com/settings/developers → your OAuth app |
| `GITHUB_CLIENT_SECRET` | Same page |
| `DEEPGRAM_API_KEY` | console.deepgram.com → API Keys |
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |
| `REVENUECAT_API_KEY` | RevenueCat dashboard (optional) |
| `NEXT_PUBLIC_REVENUECAT_API_KEY` | RevenueCat dashboard (optional) |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat webhooks (optional) |
| `REVENUECAT_PROJECT_ID` | RevenueCat dashboard (optional) |
| `TELEPHONY_PROVIDER` | `twilio` or `telnyx` (or leave blank) |
| `TWILIO_ACCOUNT_SID` | twilio.com/console (if using Twilio) |
| `TWILIO_AUTH_TOKEN` | twilio.com/console (if using Twilio) |
| `TELNYX_API_KEY` | telnyx.com (if using Telnyx) |

`NEXTAUTH_SECRET`, `IMPERSONATION_SECRET`, and `DATABASE_URL` are auto-handled by Render.

---

## Step 4 — Get your Render URL and update env vars

1. In the web service → **Settings** → **Custom Domains**, copy the auto-generated URL (e.g., `https://zevox.onrender.com`)
2. Update these two env vars to match:
   - `NEXTAUTH_URL` = `https://zevox.onrender.com`
   - `NEXT_PUBLIC_APP_URL` = `https://zevox.onrender.com`
3. **Update Google OAuth callback URL** in GCP Console:
   - Add `https://zevox.onrender.com/api/auth/callback/google` to Authorized redirect URIs
4. Click **Save Changes** — Render triggers a redeploy

---

## Step 5 — Verify

1. Open `https://zevox.onrender.com` — you should see the landing page
2. Click **Sign in** → log in with Google
3. You should land on `/dashboard`
4. Test the WebSocket: `wss://sn-voice-saas.onrender.com/voice?token=<your-api-token>`

> **WebSocket note:** Render's Starter plan ($7/mo) fully supports WebSockets. The free tier drops idle connections after 5 minutes — use Starter or higher for production.

---

## Step 6 — (Optional) Custom domain

1. Web service → **Settings** → **Custom Domains** → **Add Custom Domain**
2. Add your domain (e.g., `app.zevox.io`)
3. Add the CNAME record Render shows to your DNS provider
4. SSL is provisioned automatically via Let's Encrypt
5. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the custom domain
6. Update Google OAuth redirect URIs to the custom domain

---

## Database migrations

The `startCommand` in `render.yaml` already runs `prisma db push` before starting the server:

```
npx prisma db push --accept-data-loss && npx tsx server.ts
```

This is safe for an empty database on first deploy. Once you have real data, switch to `prisma migrate deploy` and manage migration files properly.

---

## Cost estimate

| Tier | Monthly cost |
|---|---|
| **Dev / pilot** | Free DB + Render free (no WebSockets) + Deepgram free credit | ~$0 |
| **Production** | Render Starter ($7/mo) + free DB (up to 256MB) + Deepgram pay-as-you-go | ~$7 + usage |
| **Scale** | Render Standard ($25/mo) + Render Postgres ($7-20/mo) + Deepgram + LLM tokens | ~$30-60+/mo |

---

## Troubleshooting

**Build fails on `prisma generate`**
`prisma generate` only needs the schema file, not a live DB. Check that `prisma/schema.prisma` is in the repo (it is, per the Dockerfile).

**App crashes on start with `NEXTAUTH_SECRET` error**
The Blueprint auto-generates `NEXTAUTH_SECRET`. If you deployed manually without it, add it: `openssl rand -base64 32`.

**Google sign-in redirects to wrong URL**
`NEXTAUTH_URL` is wrong. Set it to the exact URL users hit (including `https://`).

**WebSocket connection drops after 5 minutes**
You're on the free plan. Upgrade to Starter.

**`tsx` not found**
`tsx` is in `devDependencies`. The Dockerfile runs `npm ci` without `--production`, so it's included. If you see this error, check the Dockerfile hasn't been changed to `npm ci --production`.

**Database schema not applied**
The `startCommand` runs `prisma db push` on every start. If it failed, check the service logs for the DB connection error.
