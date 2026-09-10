# NOIA // LOCAL INTEL

Tactical ops board MVP: US ZIP/address → dark HUD with live ADS-B aircraft (adsb.lol / adsb.fi), RainViewer weather radar, and police-scanner deep-links (no audio embed).

## Stack

- Vite + React + TypeScript
- Leaflet / react-leaflet
- Cloudflare Pages Functions under `functions/api/`

## Local development

```bash
cd /workspace/noia
npm install
npm run dev
```

Open the printed local URL. Vite middleware in `scripts/dev-api.mjs` mirrors the Pages Functions so `/api/*` works without Wrangler.

```bash
npm run build    # typecheck + production static build → dist/
npm run preview  # preview dist/ with the same local /api middleware
```

## Cloudflare Pages deploy

1. Push this repo to GitHub.
2. In Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → connect the GitHub repo.
3. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (or repo root if monorepo)
4. Pages automatically serves `functions/` as Pages Functions (`/api/geocode`, `/api/aircraft`, `/api/radar`, `/api/scanners`).
5. SPA fallback is provided by `public/_redirects` (`/* → /index.html` 200).

No secrets required for the MVP (public ADS-B (adsb.lol), RainViewer, Nominatim with identified User-Agent).

### Optional Wrangler local Pages

```bash
npx wrangler pages dev dist --compatibility-date=2024-09-01
```

(Build first so `dist/` exists; Functions are picked up from `functions/`.)

## API routes

| Route | Purpose |
|-------|---------|
| `GET /api/geocode?q=` | Nominatim proxy (ZIP → `postalcode` + `countrycodes=us`) |
| `GET /api/aircraft?lat=&lon=&radiusKm=` | adsb.lol / adsb.fi circle query |
| `GET /api/radar` | RainViewer `weather-maps.json` proxy |
| `GET /api/scanners?lat=&lon=` | Reverse geocode → Broadcastify / RadioReference links |

Nominatim User-Agent: `NoiaOps/1.0 (contact: saintsola13)`.

## Product notes

- Aircraft markers/labels: **ADS-B (adsb.lol) — not military radar**
- Scanners: deep-links only; short legal/terms disclaimer in UI
- Aesthetic: black / olive / amber HUD, scanlines, monospace

## License

Private MVP — all rights reserved unless otherwise noted.

## API quirks

- **RainViewer** `weather-maps.json` v2 uses `radar.past` / `radar.nowcast` (not a flat `radar[]`). Tile URL pattern: `{host}{path}/256/{z}/{x}/{y}/2/1_1.png`.
- **Nominatim** for some US ZIPs returns county under `city_district` (e.g. NYC). The proxy maps `county || city_district`. Respect rate limits; User-Agent is required.
- **ADS-B:** OpenSky often blocks Cloudflare egress (HTTP 522). MVP uses **adsb.lol** with **adsb.fi** failover. Distances are nautical miles upstream; we convert from km.
- Scanners never embed audio — only deep-links + disclaimer.
