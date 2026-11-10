# Crewline

Crewline turns a printed delivery note into a validated stock record. A worker
scans the paper note, on-device OCR fills a draft, the draft is checked against
a purchase order (PO), corrections can be spoken with Gnani speech-to-text, and
the confirmed delivery updates the PO. A supervisor dashboard then shows
receiving progress across orders and sites.

This repository is the monorepo for the Crewline demo built for the Gnani
hackathon. It contains a mobile app, a Go API, a marketing/showcase site, and
sample delivery notes.

## What it does

1. **Sign in by role** — worker or supervisor (demo authentication only).
2. **Worker dashboard** — start a delivery-note scan from the daily task view.
3. **Scan** — photograph the note with the camera; OCR runs on-device.
4. **Review** — parsed fields (PO number, note number, supplier, date, site,
   items) can be edited manually.
5. **Validate** — the note is checked against the PO. Supplier, site, item,
   quantity, PO-status, duplicate-note, and date-format mismatches block the
   worker. A delivery date that differs from the expected date only warns.
6. **Correct by voice** — Gnani transcribes a spoken correction, the app
   proposes field/item changes, and the worker applies them. Validation re-runs.
7. **Confirm** — the delivery is recorded transactionally and the PO counters
   and status are updated.
8. **Supervisor dashboard** — search and filter orders, inspect line-level
   received/damaged/remaining quantities, and see cancelled orders.

## Architecture

```text
┌─────────────────────────────┐
│ app/  Expo + React Native   │
│  Expo Router screens        │
│  on-device OCR              │
│  Gnani STT (mobile only)    │
└──────────────┬──────────────┘
               │ JSON /api/v1
┌──────────────▼──────────────┐
│ backend/  Go + Gin + pgx    │
│  validation + recording     │
│  purchase orders            │
└──────────────┬──────────────┘
               │ SQL
┌──────────────▼──────────────┐
│ PostgreSQL 17               │
└─────────────────────────────┘

website/  static Vite + React + Tailwind showcase (no backend calls)
```

- **Mobile app** — Expo SDK 58, React Native 0.88, Expo Router, TypeScript.
- **Backend** — Go 1.27, Gin, pgx/v5, `decimal`, goose migrations.
- **Database** — PostgreSQL 15+ (the Docker Compose setup uses PostgreSQL 17).
- **Showcase site** — Vite, React, TypeScript, Tailwind CSS, Motion.
- **Speech-to-text** — Gnani Vachana API (`prisma-v3.0`), called directly from
  the app.

## Repository layout

```text
.
├── app/                 Expo/React Native mobile app
│   ├── src/app/         Expo Router screens
│   ├── src/components/  UI, camera, voice correction components
│   ├── src/hooks/       Microphone recording hook
│   ├── src/lib/         API client, OCR, delivery-note parsing, voice parsing
│   └── assets/          App icons and splash assets
├── backend/             Go API
│   ├── cmd/api/         Entrypoint
│   ├── internal/        config, database, HTTP, service, store
│   ├── migrations/      goose SQL migrations
│   ├── api/schemas/     JSON Schema contract documentation
│   ├── scripts/         Seed data and sample request payloads
│   ├── compose.yaml     Local PostgreSQL
│   └── Makefile         Common backend commands
├── website/             Static Crewline showcase site
│   └── src/             Hero, scroll-driven chapters, demo player, CTA
├── samples/             Printable/scannable sample delivery note
└── scripts/dev.sh       One-command full-stack development starter
```

## Quick start

### Prerequisites

- Node.js 20+ and npm
- Go 1.27+ (the module pins `toolchain go1.27.3`)
- Docker (recommended for PostgreSQL), or a local PostgreSQL 15+ install
- Android emulator/device for the full app experience; iOS is also supported

`scripts/dev.sh` expects an Android device in `adb` `device` state and starts
PostgreSQL, migrations, seed data, the API, `adb reverse` for ports 8080/8081,
and the Expo dev client.

```bash
./scripts/dev.sh              # full stack + Expo Android
./scripts/dev.sh --app-only   # use an already-running backend
./scripts/dev.sh --clear      # clear Expo/Metro cache first
```

Environment overrides:

- `NODE_BIN_DIR` — directory containing a Node.js 20+ binary.
- `ADB_SERIAL` — choose a device when multiple are connected.
- `ADB` — explicit path to `adb`.

### Backend

```bash
cd backend
cp .env.example .env          # DATABASE_URL, PORT, CORS, pool sizes

# Docker PostgreSQL
docker compose up -d db
make migrate-up
make seed                     # loads the sample POs and lines
make run                      # http://localhost:8080
```

Using a locally installed PostgreSQL instead:

```bash
createdb gnani
cd backend
make migrate-up
make seed-local
make run
```

Verify the service:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
curl http://localhost:8080/api/v1/ping
curl http://localhost:8080/api/v1/orders
```

See [`backend/README.md`](backend/README.md) for the full endpoint reference,
request/response examples, validation issue codes, status codes, and idempotency
behavior.

### Mobile app

```bash
cd app
npm install
cp .env.example .env
npm start                     # or: npx expo start
```

Set `EXPO_PUBLIC_API_URL` for the target:

| Target | Value |
| --- | --- |
| iOS simulator / web | `http://localhost:8080` |
| Android emulator | `http://10.0.2.2:8080` |
| Physical device | `http://<computer-LAN-IP>:8080` |

The app uses `npx expo run:android` / `npx expo run:ios` for a development
build. This is required for `expo-text-extractor`, which is a custom native
module not bundled with Expo Go. Camera and microphone config live in
`app/app.json`.

Voice correction additionally requires a Gnani API key:

```bash
# app/.env.local — ignored by git
EXPO_PUBLIC_GNANI_API_KEY=your-key
EXPO_PUBLIC_GNANI_STT_LANGUAGE=en-IN
```

`EXPO_PUBLIC_*` values are embedded in the app bundle, so this key is not
secret. Voice input is available on Android and iOS only.

Useful commands:

```bash
npm run lint          # expo lint
npx tsc --noEmit      # typecheck
npx expo-doctor       # dependency/config diagnostics
```

### Showcase website

```bash
cd website
npm install
npm run dev                   # http://127.0.0.1:4173
npm run build                 # typecheck + static build to dist/
npm run preview               # serve the production build
```

The site is fully static. Its 90-second scroll story is driven by
`website/src/data/chapters.ts`. The demo video is expected at
`website/public/media/crewline-demo.mp4`; until that file exists, the player
falls back to the poster and a "coming soon" state. See
[`website/README.md`](website/README.md) for chapter timings, structure, and
deployment notes.

## API

Base path: `/api/v1`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness probe (no dependencies) |
| `GET` | `/readyz` | Readiness probe; pings PostgreSQL |
| `GET` | `/api/v1/ping` | Example versioned route |
| `GET` | `/api/v1/orders` | List purchase orders and lines for the supervisor dashboard |
| `POST` | `/api/v1/orders/validate` | Validate a scanned note against an open PO |
| `POST` | `/api/v1/deliveries` | Record a confirmed delivery and update PO counters |

The backend does not trust the validate response. `POST /deliveries` re-runs
the same business validation server-side inside one transaction.

### Key behaviors

- **PO number is required** and is the join key between the note and the order.
- Partial deliveries are allowed, but every note line must match a PO line.
- A note line may include `receivedQuantity`; when supplied, over-receipt is
  checked against the good quantity, so damaged units do not block an otherwise
  valid delivery.
- `clientRequestId` enables idempotent retries: the same ID returns the existing
  record with `idempotentReplay: true`.
- A duplicate delivery-note number for the same PO returns `409`.
- Delivery-date variance is a warning; malformed non-empty dates are business
  issues (`200` with `valid: false` on validate, `422` on create).
- An optional `voiceTranscript` and `rawOcrText` are stored for audit.

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Starter login table (currently unused by auth) |
| `purchase_orders` | PO header, site, status, expected/cancelled dates |
| `purchase_order_items` | Ordered, received, and damaged quantities per line |
| `deliveries` | Confirmed delivery, worker identity, transcript, OCR text |
| `delivery_items` | Per-line note/received/damaged quantities and remarks |

PO status transitions through `open`, `partially_received`, `closed`, and
`cancelled`. Cancelled orders remain visible to supervisors but do not count
toward receiving progress.

There is no PO CRUD API in this MVP. Orders are provisioned by
`backend/scripts/seed_dev.sql` or inserted directly with SQL. The seed defines
`PO-1042`, `PO-1039`, `PO-1035`, `PO-1028`, and `PO-1024` with fixed item UUIDs
so the sample payloads work without copying IDs.

## Sample delivery note

The [`samples/`](samples/) folder contains a printable PDF and a PNG of a clean
delivery note that matches the seed data:

| Field | Value |
| --- | --- |
| PO number | `PO-1042` |
| Delivery note number | `DN-2086` |
| Supplier | `Acme Supplies` |
| Site | `Riverside Tower` |
| Delivery date | `10 November 2026` (`2026-11-10`) |
| Items | Cement bags × 50, Steel rebar × 20 |

See [`samples/README.md`](samples/README.md) for expected OCR output, repeat-test
caveats, and voice-correction phrases to try.

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `APP_ENV` | `development` | `production` switches to JSON logs |
| `PORT` | `8080` | Listen port when `ADDR` is unset |
| `ADDR` | `:8080` | Full listen address |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `SHUTDOWN_TIMEOUT` | `10s` | Graceful shutdown budget |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable` | PostgreSQL connection string |
| `DB_MAX_CONNS` | `10` | Maximum pool connections |
| `DB_MIN_CONNS` | `1` | Minimum idle pool connections |

### Mobile (`app/.env` / `app/.env.local`)

| Variable | Default | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | — | Backend base URL (required) |
| `EXPO_PUBLIC_GNANI_API_KEY` | — | Gnani STT key; required for voice correction |
| `EXPO_PUBLIC_GNANI_STT_LANGUAGE` | `en-IN` | STT language; handles English/Hinglish |

## Testing and verification

```bash
# Backend
cd backend
make test             # go test ./...
make vet              # go vet ./...
make fmt              # gofmt

# Mobile
cd app
npx tsc --noEmit
npm run lint

# Website
cd website
npm run typecheck
npm run build
```

Backend unit tests use fakes for the store. The manual acceptance checklist in
[`backend/PLAN.md`](backend/PLAN.md) is intended to be run against a real
PostgreSQL instance to verify SQL queries, locking, transactions, and counters.

## Docker

Build and run the API image:

```bash
cd backend
docker build -t crewline-api .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:5432/gnani?sslmode=disable" \
  crewline-api
```
