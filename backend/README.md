# Backend API

Go + [Gin](https://gin-gonic.com/) + [pgx](https://github.com/jackc/pgx) (PostgreSQL) service for the Gnani hackathon app.

## Requirements

- Go 1.27+ (see the toolchain note below)
- PostgreSQL 15+ (local or Docker)
- `psql` only when using a locally installed PostgreSQL

`go.mod` declares `go 1.27` and pins `toolchain go1.27.3`. Go 1.21+ downloads
the pinned toolchain automatically. If toolchain downloads are disabled, install
Go 1.27.3 explicitly.

## Quick start

Copy the environment file first:

```bash
cd backend
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

The API reads `.env` at runtime, but the `Makefile` does not. Export
`DATABASE_URL` in the shell or pass it to `make` when it differs from the
default.

### Option A: local PostgreSQL

Create the database once, apply the migrations, and load the sample purchase
order:

```bash
createdb gnani                # only if the database does not exist
make migrate-up
make seed-local
make run                      # http://localhost:8080
```

`make seed-local` uses `psql` and `DATABASE_URL`. If PostgreSQL uses a different
user or port, override it, for example:

```bash
make seed-local DATABASE_URL="postgres://myuser:secret@localhost:5432/gnani?sslmode=disable"
```

### Option B: Docker PostgreSQL

```bash
docker compose up -d db       # start local Postgres
make migrate-up               # apply migrations
make seed                     # load the sample PO into the Docker database
make run                      # http://localhost:8080
```

Without `make`, the equivalent migrate command is:

```bash
go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres \
  "postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable" up
go run ./cmd/api
```

Verify the service is up:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
curl http://localhost:8080/api/v1/ping
```

## Endpoints

| Method | Path                      | Description                                        |
| ------ | ------------------------- | -------------------------------------------------- |
| GET    | `/healthz`                | Liveness probe (no dependencies)                   |
| GET    | `/readyz`                 | Readiness probe, pings PostgreSQL                  |
| GET    | `/api/v1/ping`            | Example versioned API route                        |
| GET    | `/api/v1/orders`          | List purchase orders for the supervisor dashboard  |
| POST   | `/api/v1/orders/validate` | Validate a scanned note against an open PO         |
| POST   | `/api/v1/deliveries`      | Record a confirmed delivery and update PO counters |

The delivery routes replace the original `/check-order-validity` and
`/add-record` names. They are documented below.

## Supervisor orders

`GET /api/v1/orders` returns every purchase order and its lines for the
supervisor dashboard:

```bash
curl -s http://localhost:8080/api/v1/orders | jq
```

```json
{
  "orders": [
    {
      "poNumber": "PO-1042",
      "supplier": "Acme Supplies",
      "site": "Riverside Tower",
      "status": "open",
      "expectedDeliveryDate": "2026-11-10",
      "cancelledAt": null,
      "cancellationReason": null,
      "items": [
        {
          "id": "00000000-0000-0000-0000-000000000011",
          "lineNumber": 1,
          "description": "Cement bags",
          "orderedQuantity": 50,
          "receivedQuantity": 0,
          "damagedQuantity": 0,
          "remainingQuantity": 50
        }
      ]
    }
  ]
}
```

The app performs search and status filtering locally. The endpoint returns all
orders for now; server-side filtering and pagination are follow-up work. An
empty database returns `{"orders":[]}`.

## Delivery flow

1. The worker scans a delivery note. The note must contain a **PO number**;
   it is the join key to the purchase order in the database.
2. `POST /api/v1/orders/validate` compares the scanned supplier, site, items,
   and quantities with the PO. A business-invalid result still returns `200`
   with `valid: false` and an `issues` array.
3. The worker reviews the data and confirms the delivery.
4. `POST /api/v1/deliveries` re-runs the same validation server-side and writes
   the delivery, its items, and the updated PO counters in one transaction.

Supplier, site, item, quantity, PO-status, duplicate-note, and date-format
mismatches block the worker. A delivery date that differs from the PO's
expected date is a warning, not a block. Partial deliveries are allowed, but
every item on the note must match a PO line.

### Purchase orders and worker identity

There is no purchase-order CRUD API in this MVP. POs and their lines are
provisioned by `scripts/seed_dev.sql` or inserted directly with SQL. The seed
provides `PO-1042` with fixed item UUIDs so the sample payloads work without
copying IDs.

`poItemId` is optional on `/orders/validate`: the service can resolve a unique
item description. It is **required** on `/deliveries`. Copy the `items[].id`
values from the validation response into the create request, or let the app map
them by description.

Worker identity is self-reported in `worker.name` and `worker.identifier`. There
is no authentication or authorization in this MVP. Do not expose the service on
an untrusted network without adding auth in front of it.

## Seed data and curl examples

The seed is idempotent. Load it with `make seed` for Docker or
`make seed-local` for a locally installed PostgreSQL:

```bash
# Docker
docker compose up -d db
make migrate-up
make seed

# Local PostgreSQL
make migrate-up
make seed-local
```

The equivalent direct `psql` command is:

```bash
psql "postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable" \
  -f scripts/seed_dev.sql
```

Validate the sample note:

```bash
curl -s http://localhost:8080/api/v1/orders/validate \
  -H 'Content-Type: application/json' \
  -d @scripts/sample-validate.json | jq
```

A compact request body for the same call:

```json
{
  "poNumber": "PO-1042",
  "deliveryNoteNumber": "DN-1042",
  "supplier": "Acme Supplies",
  "deliveryDate": "2026-11-06",
  "site": "Riverside Tower",
  "items": [
    {
      "poItemId": "00000000-0000-0000-0000-000000000011",
      "description": "Cement bags",
      "quantity": 50
    },
    {
      "poItemId": "00000000-0000-0000-0000-000000000012",
      "description": "Steel rebar",
      "quantity": 20
    }
  ]
}
```

`items[].receivedQuantity` is optional on validation. When supplied, the
over-receipt check uses the good quantity instead of the full note quantity, so
damaged units do not block a delivery that still fits within the PO’s remaining
quantity. For example, a note line with `quantity: 50` and
`receivedQuantity: 48` contributes 48 good units and 2 damaged units.

A valid response has this shape:

```json
{
  "valid": true,
  "order": {
    "poNumber": "PO-1042",
    "supplier": "Acme Supplies",
    "site": "Riverside Tower",
    "status": "open",
    "expectedDeliveryDate": "2026-11-10",
    "items": [
      {
        "id": "00000000-0000-0000-0000-000000000011",
        "lineNumber": 1,
        "description": "Cement bags",
        "orderedQuantity": 50,
        "receivedQuantity": 0,
        "damagedQuantity": 0,
        "remainingQuantity": 50
      },
      {
        "id": "00000000-0000-0000-0000-000000000012",
        "lineNumber": 2,
        "description": "Steel rebar",
        "orderedQuantity": 20,
        "receivedQuantity": 0,
        "damagedQuantity": 0,
        "remainingQuantity": 20
      }
    ]
  },
  "deliveryNote": {
    "number": "DN-1042",
    "alreadyRecorded": false
  },
  "issues": [
    {
      "severity": "warning",
      "code": "DELIVERY_DATE_VARIANCE",
      "field": "deliveryDate",
      "actual": "2026-11-06",
      "expected": "2026-11-10",
      "message": "Delivery date differs from the expected date."
    }
  ]
}
```

The sample delivery date is earlier than the PO's expected date, so the
response contains a non-blocking warning. The note is still `valid: true`.

Status codes for the validate route:

| Status | Meaning |
| ------ | ------- |
| `200`  | Validation completed; inspect `valid` and `issues` |
| `400`  | Malformed JSON, missing fields, or invalid field shape; inspect `error.fields` |
| `413`  | Request body exceeds 1 MiB |
| `500`  | Internal server error |

Record the confirmed delivery:

```bash
curl -s http://localhost:8080/api/v1/deliveries \
  -H 'Content-Type: application/json' \
  -d @scripts/sample-create.json | jq
```

A compact request body for the same call:

```json
{
  "clientRequestId": "sample-request-0001",
  "poNumber": "PO-1042",
  "deliveryNoteNumber": "DN-1042",
  "supplier": "Acme Supplies",
  "deliveryDate": "2026-11-06",
  "site": "Riverside Tower",
  "worker": {
    "name": "Pranjal",
    "identifier": "pranjal@example.com"
  },
  "items": [
    {
      "poItemId": "00000000-0000-0000-0000-000000000011",
      "description": "Cement bags",
      "quantity": 50,
      "receivedQuantity": 48,
      "damagedQuantity": 2,
      "remarks": "Two torn bags set aside."
    }
  ]
}
```

`quantity` is the quantity written on the note. `receivedQuantity` and
`damagedQuantity` describe what the worker actually accepted; their sum cannot
exceed `quantity`. Quantities are decimals with at most three decimal places.

The response:

```json
{
  "id": "c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c",
  "idempotentReplay": false,
  "orderStatus": "partially_received",
  "recordedAt": "2026-11-06T10:15:00Z"
}
```

The create sample uses a fixed PO item ID from `scripts/seed_dev.sql`. If you
use your own data, copy the `items[].id` values from the validation response
into the create payload as `items[].poItemId`.

Status codes for the create route:

| Status | Meaning |
| ------ | ------- |
| `201`  | Delivery recorded |
| `200`  | Same `clientRequestId` retry; returns the existing record with `idempotentReplay: true` |
| `400`  | Malformed JSON, missing fields, or invalid field shape; inspect `error.fields` |
| `409`  | The same delivery note is already recorded for the PO |
| `413`  | Request body exceeds 1 MiB |
| `422`  | Strict validation failed; inspect `error.issues` |
| `500`  | Internal server error |

A missing required field returns `400`. A non-empty delivery date that is not
ISO `YYYY-MM-DD` is a business validation issue: the validate route returns
`200` with `valid: false` and an `INVALID_DATE` issue, and the create route
returns `422` with the same issue.

### Idempotent retries and duplicate notes

`clientRequestId` is optional. When supplied it must be 8–128 characters. Reuse
the exact same value when retrying a create request whose response was lost; the
server returns `200` with the original delivery and `idempotentReplay: true`.

A new `clientRequestId` with a delivery note number that is already recorded for
the same PO is rejected with `409` and error code `DELIVERY_ALREADY_RECORDED`.
This prevents duplicate deliveries even if the app retries incorrectly.

To rerun the sample after recording it, reset the Docker volume and re-apply
the migrations (`docker compose down -v`, then `docker compose up -d db`,
`make migrate-up`, and `make seed`), or use a new note number and request ID.
For a local database, drop and recreate the database or use a new note number
and request ID.

## Errors and validation issues

Request-level failures use a single error envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Delivery note does not match the purchase order.",
    "issues": [
      {
        "severity": "error",
        "code": "SUPPLIER_MISMATCH",
        "field": "supplier",
        "actual": "Acme Supply",
        "expected": "Acme Supplies",
        "message": "Supplier does not match the purchase order."
      }
    ]
  }
}
```

`issues` is used for `422` business failures and is also present in a `200`
validation response. A `400` request-shape failure uses `fields` instead, for
example:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request body is invalid.",
    "fields": {
      "poNumber": "required"
    }
  }
}
```

Envelope codes are `INVALID_REQUEST`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED`,
`DELIVERY_ALREADY_RECORDED`, and `INTERNAL_ERROR`.

Business issue codes:

| Code | Severity | Typical field | Meaning |
| ---- | -------- | ------------- | ------- |
| `ORDER_NOT_FOUND` | error | `poNumber` | No PO exists for the supplied number |
| `ORDER_CANCELLED` | error | `poNumber` | The PO is cancelled |
| `ORDER_NOT_OPEN` | error | `poNumber` | The PO is closed or otherwise not open for receiving |
| `SUPPLIER_MISMATCH` | error | `supplier` | Supplier does not match the PO |
| `SITE_MISMATCH` | error | `site` | Site does not match the PO |
| `DELIVERY_ALREADY_RECORDED` | error | `deliveryNoteNumber` | The note is already recorded for the PO |
| `INVALID_DATE` | error | `deliveryDate` | A non-empty date is not valid ISO `YYYY-MM-DD`; a missing date is `400` |
| `DELIVERY_DATE_VARIANCE` | warning | `deliveryDate` | Date differs from the PO's expected date but does not block |
| `ITEMS_REQUIRED` | error | `items` | Service-level check for an empty item list; the HTTP layer normally rejects this as `400` first |
| `UNKNOWN_ITEM` | error | `items[i].description` or `items[i].poItemId` | Item does not match a PO line |
| `AMBIGUOUS_ITEM` | error | `items[i].description` | Description matches multiple PO lines; send `poItemId` |
| `DUPLICATE_ITEM` | error | `items[i]` | Two note lines map to the same PO line |
| `INVALID_QUANTITY` | error | `items[i].quantity`, `.receivedQuantity`, or `.damagedQuantity` | Quantity is non-positive, or received plus damaged exceeds the note quantity; the HTTP layer rejects missing or malformed values with `400` |
| `OVER_RECEIPT` | error | `items[i].receivedQuantity` | Received good quantity exceeds the PO line's remaining quantity; see `expectedMax` |

The JSON Schema contracts are in `api/schemas/delivery-note.schema.json` and
`api/schemas/delivery-record.schema.json`. They are documentation; the runtime
validator is Go code in `internal/service`.

Add new routes in `internal/httpapi/router.go` under the `v1` group.

## Connect the mobile app

The Expo app lives in `../app` and calls this service from
`app/src/lib/api.ts`.

1. Copy the app environment example:

   ```bash
   cd ../app
   cp .env.example .env
   ```

2. Set `EXPO_PUBLIC_API_URL` in `app/.env`:

   - iOS simulator or web: `http://localhost:8080`
   - Android emulator: `http://10.0.2.2:8080`
   - Physical device: `http://<your-computer-LAN-IP>:8080`

3. Start the backend with `make run`, then start Expo with `npm start` from
   `app/`. Restart Expo after changing `.env`.

The app extracts the PO number, normalizes the delivery date to `YYYY-MM-DD`,
and calls `/orders/validate` before enabling confirmation. It maps the PO item
IDs from the validation response and reuses one `clientRequestId` when retrying
the same create request. The backend's default `CORS_ORIGINS=*` is convenient
for local web development; restrict it for a deployed environment.

The app now depends on `expo-crypto` for `clientRequestId` generation. Expo Go
includes it; if you use a custom development build, rebuild it after installing
dependencies (`npx expo run:android` or `npx expo run:ios`).

## Environment variables

Copy `.env.example` to `.env` for local development. Environment variables set in
the shell take precedence over `.env`.

| Variable           | Default                                                                   | Description                              |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------- |
| `APP_ENV`          | `development`                                                             | `production` switches to JSON logs       |
| `PORT`             | `8080`                                                                    | Listen port (used when `ADDR` is unset)  |
| `ADDR`             | `:8080`                                                                   | Full listen address, overrides `PORT`    |
| `CORS_ORIGINS`     | `*`                                                                       | Comma-separated allowed origins          |
| `SHUTDOWN_TIMEOUT` | `10s`                                                                     | Graceful shutdown budget                 |
| `DATABASE_URL`     | `postgres://postgres:postgres@localhost:5432/gnani?sslmode=disable`      | PostgreSQL connection string             |
| `DB_MAX_CONNS`     | `10`                                                                      | Maximum pool connections                 |
| `DB_MIN_CONNS`     | `1`                                                                       | Minimum idle pool connections            |

## Project layout

```text
backend/
├── api/schemas/          # JSON Schema contract documentation
├── cmd/api/              # Application entrypoint (config, DB, HTTP server, shutdown)
├── internal/
│   ├── config/           # Environment configuration
│   ├── database/         # pgxpool setup
│   ├── httpapi/          # Gin router, middleware, handlers
│   ├── service/          # Delivery validation and recording rules
│   └── store/            # PostgreSQL queries and transactions
├── migrations/           # goose SQL migrations
├── scripts/              # Development seed and sample payloads
├── compose.yaml          # Local PostgreSQL
├── Dockerfile
└── Makefile
```

Suggested next steps as the API grows:

- Put query/repository code in `internal/store/` and business logic in `internal/service/`.
- Register handlers per domain (e.g. `internal/httpapi/users.go`) on the `v1` group.
- Add migrations as `migrations/00002_<description>.sql` with `-- +goose Up` / `-- +goose Down`.

`migrations/00001_init.sql` contains a starter `users` table that mirrors the
mobile login screen. `migrations/00002_purchase_orders_and_deliveries.sql` adds
the purchase order, delivery, and delivery item tables used by the two delivery
routes.

## Common commands

```bash
make run             # run the API
make build           # build to bin/api
make test            # go test ./...
make fmt             # gofmt
make vet             # go vet
make tidy            # go mod tidy
make migrate-up      # apply all migrations
make migrate-down    # roll back one migration
make migrate-status  # show migration status
make seed            # load the sample PO into Docker Postgres
make seed-local      # load the sample PO into a local PostgreSQL via psql
```

The unit tests use fakes for the store. Run the [manual acceptance
checklist](PLAN.md) against a real PostgreSQL instance before deployment to
verify the SQL queries, transaction, locking, and counters.

## Docker

Build and run the API image:

```bash
docker build -t gnani-api .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:5432/gnani?sslmode=disable" \
  gnani-api
```
