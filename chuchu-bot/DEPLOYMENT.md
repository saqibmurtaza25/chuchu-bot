# CHUCHU BOT — Deploy Live Guide (Step by Step)

> **Ek minute ka summary / TL;DR**
> Bot ko 24/7 chalane ke liye 2 cheezein chahiye:
> 1. **Backend** (live data engine) — kisi "always-on" free host par: **Fly.io** (best) / **Railway** / **Render**.
> 2. **Frontend** (dashboard UI) — **Cloudflare Pages** (GitHub se free, hamesha on).
>
> Cloudflare Pages **sirf** frontend host karta hai — backend us par nahi chal sakta, is liye dono zaroori hain.

---

## Architecture

```
[User's phone/browser]
        │
        ▼
Cloudflare Pages  ─────────────┐   (frontend, static, free, always on)
 https://your-app.pages.dev     │
        │  /api + /socket.io    │
        ▼                       │
Deployed Backend (Fly.io/Railway/Render)  ◄──── binance.com live data
 https://your-backend.fly.dev
```

The frontend is configured with `VITE_SERVER_URL` = your backend URL.
If you leave it empty, the frontend uses same-origin (`/api`, `/socket.io`) which is
how local dev works via the Vite proxy.

---

## Step 0 — One-time local checks (optional)

```bash
pnpm install
pnpm build          # everything compiles
pnpm test
```

Start locally if you want to see it first:

```bash
# terminal 1
cd packages/backend && PORT=8080 node start-server.js
# terminal 2
cd packages/frontend && npx vite
```

---

## Step 1 — Push the project to GitHub

1. Go to https://github.com → **New repository** → name it e.g. `chuchu-bot`.
2. Copy your repo URL: `https://github.com/YOUR_USERNAME/chuchu-bot.git`
3. On your computer, from the project folder:

```bash
git init
git add -A
git commit -m "chuchu bot v2"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chuchu-bot.git
git push -u origin main
```

The repo already contains the deploy files you need:
`Dockerfile`, `render.yaml`, `railway.toml`, `fly.toml`, `packages/frontend/.env.example`.

---

## Step 2 — Deploy the BACKEND (choose ONE)

### Option A: Fly.io (RECOMMENDED for free 24/7 — machines never sleep)

Why: free allowance = 3 always-on machines, 256 MB each. No sleeping.

1. Install flyctl: https://fly.io/docs/happypath/installation/
   - Windows: `iwr https://fly.io/install.ps1 -UseBasicParsing | iex`
   - Mac/Linux: `curl -L https://fly.io/install.sh | sh`
2. Login & signup (a credit card is usually requested for verification, but the
   free allowance costs nothing as long as you stay inside it):
   ```bash
   flyctl auth login
   flyctl launch --no-deploy
   ```
3. It detects `fly.toml` — press Enter to accept defaults.
4. Deploy:
   ```bash
   flyctl deploy
   ```
5. Done. Your backend URL: `https://chuchu-bot.fly.dev`
   (test it: open `https://chuchu-bot.fly.dev/health` — you should see JSON `"status":"OK"`)

> Keep it inside free limits: 1 machine is enough (`flyctl scale count 1`).
> Watch usage with `flyctl dashboard`.

### Option B: Railway (easy, Docker auto-detected)

1. https://railway.app → Sign up with GitHub.
2. **New Project → Deploy from GitHub repo** → pick `chuchu-bot`.
3. Railway auto-detects the `Dockerfile` and `railway.toml` (health check included).
4. Go to the service → **Settings → Networking → Generate Domain**.
5. Open the generated domain + `/health` to confirm.
   Backend URL = that domain.

> Railway free tier gives a small one-time credit, then usage is billed.
> Stop it when not needed to avoid charges.

### Option C: Render (easy, but FREE PLAN SLEEPS)

Render free web services **turn off after ~15 min of inactivity** — bad for a live bot.
Use this only if you just want a quick test, or choose a paid plan for real 24/7.

1. https://render.com → **New → Web Service** → connect GitHub repo.
2. It auto-detects the `Dockerfile` (via `render.yaml` blueprint).
3. Click **Create Web Service**.
4. Backend URL = `https://<service-name>.onrender.com` (test `/health`).

---

## Step 3 — Deploy the FRONTEND to Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the `chuchu-bot` repo → **Begin setup**.
3. Set build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `pnpm install --frozen-lockfile && pnpm --filter @chuchu/frontend build`
   - **Build output directory**: `packages/frontend/dist`
4. Add the environment variable (very important):
   - **Variable name**: `VITE_SERVER_URL`
   - **Value**: your backend URL from Step 2, e.g. `https://chuchu-bot.fly.dev`
5. Click **Save and Deploy**.
6. Done. Your dashboard URL = `https://<your-project>.pages.dev`

> Changing the backend URL later? Edit the `VITE_SERVER_URL` variable in
> Cloudflare → Settings → Environment Variables → **Save and Redeploy**.

---

## Step 4 — Final check

1. Open your `*.pages.dev` URL on your phone and desktop.
2. Top-right should show **LIVE** (green) — that means Socket.io connected to the
   backend and live Binance data is streaming.
3. If it shows **OFFLINE**:
   - Backend `/health` must return OK.
   - `VITE_SERVER_URL` must exactly match the backend URL (no trailing `/`).

---

## Important notes

- **Binance IP blocks**: Binance sometimes blocks cloud/datacenter IPs
  (especially US-based regions). If the backend starts but shows no data,
  deploy it to a region outside the US (Fly.io: `flyctl regions add nrt` for
  Tokyo) or use your own connection for the backend.
- **Render free sleeps** — use Fly.io or Railway for a real 24/7 bot.
- **Fees**: all the above have free allowances, but hosting is a third-party
  service with its own terms — always read them before going over limits.
- **Keep the backend private**: don't put real API keys in the frontend.
  Exchange/live-trading keys must live only in backend environment variables.
