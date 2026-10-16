# URL Analytics

A self-hosted URL shortener with QR codes, live click analytics and built-in on-site heatmaps.

- **Short links:** custom aliases, a QR code studio (PNG/SVG export) and channel-tagged share links (`?via=whatsapp`, …).
- **Click analytics:** IP, location, device, browser/OS, language, referrer, and the app or site a link was opened from (WhatsApp, Instagram, Gmail, QR…). Bots and link previews are filtered out.
- **Dashboard:** D3 charts (timeline with per-link comparison, world map, devices, weekday × hour heatmap), a link picker, a visits table with CSV export. Updates live.
- **Heatmaps for your own sites:** add one `<script>` tag to a site you own and get click maps, scroll depth, and rage/dead clicks, joined to the short link and channel each visitor came from.
- **UTM hand-off:** redirects can add `utm_source/medium/campaign` for tools on the destination site.

Built with Next.js 16, React 19, Prisma + SQLite, D3 and Motion.

## Run locally

```bash
npm install
cp .env.example .env          # DATABASE_URL="file:./dev.db" is enough locally
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000. With `ADMIN_PASSWORD` unset, sign-in is skipped locally.

## Deploy to Railway

1. **New Project → Deploy from GitHub repo**, and pick this repo. Build and start commands come from `railway.json`.
2. **Add a volume** to the service, mounted at `/data`. The SQLite database lives there and survives redeploys.
3. **Set variables:**

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `file:/data/prod.db` |
   | `ADMIN_PASSWORD` | a long password, required: the dashboard stays locked without it |
   | `AUTH_SECRET` | optional, any random string; changing it signs everyone out |
   | `NEXT_PUBLIC_SHORT_BASE_URL` | optional, e.g. `https://thkr.in` if links should use a different domain than the dashboard |

4. **Settings → Networking:** generate a Railway domain or add your own.
5. Deploy. On start, the app applies database migrations, then serves on Railway's `PORT`. `/api/health` is the health check.

Keep the service at **1 replica**: SQLite on a volume is single-instance.

## Heatmaps on your website

1. Open **Sites**, add your domain (e.g. `example.com`).
2. Paste the snippet it shows before `</head>` on every page:
   ```html
   <script defer src="https://YOUR-DEPLOYMENT/s.js" data-site="site_xxxxxxxx"></script>
   ```
3. Visit the site once. The badge switches to **Installed**, and **Heatmaps** fills in as people browse.

The snippet never reads form fields and respects Do Not Track. Page copies used as heatmap backgrounds are stored without scripts and shown in a sandboxed frame.

## What's public

Short-link redirects (`/<slug>`), the `/s.js` snippet, its collector (`/api/collect`), `/login` and `/api/health`. Everything else requires the admin password, and new routes are protected by default (`src/proxy.ts`).
