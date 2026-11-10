# Warehouse Delivery API — Implementation Plan

**Status:** Backend and app integration implemented; real-PostgreSQL acceptance pending
**Scope:** Backend routes for validating a scanned delivery note, recording the confirmed delivery, and the Expo review-screen integration
**Stack:** Go 1.27, Gin, pgx, PostgreSQL, Expo/React Native

**Verification so far:** `gofmt`, `go vet ./...`, `go test ./...`, and
`go build ./...` pass in `backend/`; `npx tsc --noEmit` and `npx expo lint`
pass in `app/`. Migration up/down, seed loading, and the end-to-end acceptance
checks are still pending a real PostgreSQL instance.

---

## 1. Summary

The worker flow needs two backend calls:

1. **Validate** the scanned delivery note against an open purchase order (PO) immediately after OCR.
2. **Record** the confirmed delivery after the worker has reviewed the data and spoken any details.

The two-step split is intentional:

- The worker gets early feedback before spending time on voice input and confirmation.
- The write call re-validates server-side. The first call is only a UX preview and is never trusted.

### Recommended routes

| Method | Route | Replaces | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/orders/validate` | `/check-order-validity` | Check the scanned note against an open PO and return expected items |
| `POST` | `/api/v1/deliveries` | `/add-record` | Persist the confirmed delivery, items, worker identity, and voice transcript |
| `GET` | `/api/v1/orders` | *missing* | Supervisor dashboard read endpoint — implemented |
| `GET` | `/api/v1/deliveries?workerIdentifier=...` | *missing* | Worker's recorded deliveries — optional follow-up |

`/add-record` is too generic. A delivery is a real resource, and `/deliveries` gives the route clear semantics, idempotency, and room to grow.

### Locked-in decisions

- **PO number is required** on the delivery note.
- **All supplier, site, item, and quantity mismatches block the worker.** There is no bypass in the MVP.
- **Worker identity is self-reported** in the request body. No auth for now.
- Delivery date must be valid and ISO-formatted, but a date that differs from the PO's expected date is a warning, not a block. Late and early deliveries are normal.
- One delivery note maps to one PO.
- Partial deliveries are allowed: every item on the note must match a PO line, but the note does not have to contain every PO line.

### Original gaps and current state

| Area | Original state | Current state |
| --- | --- | --- |
| Backend stack | Go + Gin + pgx, not Rust/actix-web as `notes.txt` says | Implemented in the existing Go code |
| Database | Only the starter `users` table | Purchase orders, PO items, deliveries, and delivery items added in migration `00002` |
| App OCR | `parseDeliveryNote()` extracted `noteNumber`, `supplier`, `deliveryDate`, `site`, `items` | PO number extraction and a required review field added |
| App item model | `DeliveryNoteItem` has `received: boolean` | Now also has `damagedQuantity`; the API client derives the good `receivedQuantity` and sends both quantities |
| App networking | No `fetch` or API client anywhere | `app/src/lib/api.ts` validates, records, and retries idempotently |
| App voice screen | Not built | Still not built; the backend accepts an optional transcript |
| Supervisor screen | Not built | Built and connected to `GET /api/v1/orders` |

---

## 2. Delivery note schema

### 2.1 Should the delivery note contain a PO number?

**Yes.** The PO number is the join key between the paper note and the backend's purchase order. The delivery-note number alone is not enough unless the warehouse pre-creates expected delivery notes in the system.

Recommended handling:

- Add `poNumber` to `DeliveryNoteDetails`.
- Extract it from OCR using labels such as `PO`, `PO No.`, `Purchase Order`, `Purchase Order No.`, and `Order Ref`.
- Show it as a required field on the review screen so the worker can correct OCR mistakes.
- If the note has no PO number, the worker must enter it manually before validation.

### 2.2 Canonical fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `poNumber` | string | yes | 1–64 chars, normalized to uppercase |
| `deliveryNoteNumber` | string | yes | 1–64 chars, normalized to uppercase |
| `supplier` | string | yes | 1–200 chars, trimmed |
| `deliveryDate` | string | yes | ISO `YYYY-MM-DD` |
| `site` | string | yes | 1–200 chars, trimmed |
| `items` | array | yes | 1–100 items |
| `items[].poItemId` | string (UUID) | no | Filled from the validation response when available |
| `items[].description` | string | yes | 1–500 chars |
| `items[].quantity` | number | yes | Greater than 0, up to 3 decimal places |
| `items[].receivedQuantity` | number | no | Good units; used for the over-receipt check when supplied |
| `rawOcrText` | string | no | Up to 20,000 chars, for audit/debugging |

The photo itself is not part of this schema. OCR runs on-device and the photo is never uploaded.

### 2.3 JSON Schema

`backend/api/schemas/delivery-note.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gnani.local/schemas/delivery-note.schema.json",
  "title": "ScannedDeliveryNote",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "poNumber",
    "deliveryNoteNumber",
    "supplier",
    "deliveryDate",
    "site",
    "items"
  ],
  "properties": {
    "poNumber": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$"
    },
    "deliveryNoteNumber": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$"
    },
    "supplier": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "deliveryDate": {
      "type": "string",
      "format": "date"
    },
    "site": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "description",
          "quantity"
        ],
        "properties": {
          "poItemId": {
            "type": "string",
            "format": "uuid"
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          "quantity": {
            "type": "number",
            "exclusiveMinimum": 0,
            "multipleOf": 0.001
          },
          "receivedQuantity": {
            "type": "number",
            "minimum": 0,
            "multipleOf": 0.001
          }
        }
      }
    },
    "rawOcrText": {
      "type": "string",
      "maxLength": 20000
    }
  }
}
```

### 2.4 App TypeScript shape

The app should move toward this shape. `noteNumber` can stay as the UI field name and be mapped to `deliveryNoteNumber` in the API client to avoid a large rename.

```ts
export type DeliveryNoteDetails = {
  poNumber: string;
  noteNumber: string; // sent as deliveryNoteNumber
  supplier: string;
  deliveryDate: string; // normalized to YYYY-MM-DD before API calls
  site: string;
  items: DeliveryNoteItem[];
};

export type DeliveryNoteItem = {
  id: string;        // local UI identifier
  poItemId?: string; // filled from the validation response
  description: string;
  quantity: string;  // UI string; API client converts to decimal
  damagedQuantity: string; // UI string; derived good qty is sent as receivedQuantity
  received: boolean; // UI only; API sends receivedQuantity/damagedQuantity
};
```

The `rawLines.join('\n')` value can be sent as `rawOcrText`.

---

## 3. Delivery record schema

### 3.1 Fields

The record extends the note with the worker, voice transcript, and the quantities the worker actually counted.

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `clientRequestId` | string | no | 8–128 chars; recommended for retry safety |
| `poNumber` | string | yes | 1–64 chars |
| `deliveryNoteNumber` | string | yes | 1–64 chars |
| `supplier` | string | yes | 1–200 chars |
| `deliveryDate` | string | yes | ISO `YYYY-MM-DD` |
| `site` | string | yes | 1–200 chars |
| `worker.name` | string | yes | 1–200 chars |
| `worker.identifier` | string | yes | 1–200 chars; self-reported email/phone/ID |
| `voiceTranscript` | string | no | Up to 20,000 chars |
| `rawOcrText` | string | no | Up to 20,000 chars |
| `items` | array | yes | 1–100 items |
| `items[].poItemId` | string (UUID) | yes | Must belong to the PO |
| `items[].description` | string | yes | 1–500 chars |
| `items[].quantity` | number | yes | Note quantity, greater than 0, up to 3 decimals |
| `items[].receivedQuantity` | number | yes | Good units accepted, `>= 0` |
| `items[].damagedQuantity` | number | yes | Damaged units, `>= 0` |
| `items[].remarks` | string | no | Up to 1,000 chars |

### 3.2 Quantity semantics

- `quantity` = quantity stated on the delivery note (after the worker's corrections).
- `receivedQuantity` = good units accepted.
- `damagedQuantity` = damaged units.
- Total physically delivered = `receivedQuantity + damagedQuantity`.
- Constraint: `receivedQuantity + damagedQuantity <= quantity`.
- A short delivery is allowed: the sum can be less than `quantity`.
- Damaged units do **not** count toward fulfilling the PO. If 48 good + 2 damaged arrive against 50 ordered, the PO remains `partially_received`, and the dashboard shows the damage separately.
- Items with `receivedQuantity: 0` and `damagedQuantity: 0` are allowed when the item was on the note but did not arrive. This records a shortage without advancing the PO.

The app derives the good quantity from the worker’s entries:

```ts
const damagedQuantity = item.received
  ? Number(item.damagedQuantity || 0)
  : 0;
const receivedQuantity = item.received
  ? Number(item.quantity) - damagedQuantity
  : 0;
```

### 3.3 JSON Schema

`backend/api/schemas/delivery-record.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gnani.local/schemas/delivery-record.schema.json",
  "title": "DeliveryRecord",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "poNumber",
    "deliveryNoteNumber",
    "supplier",
    "deliveryDate",
    "site",
    "worker",
    "items"
  ],
  "properties": {
    "clientRequestId": {
      "type": "string",
      "minLength": 8,
      "maxLength": 128
    },
    "poNumber": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$"
    },
    "deliveryNoteNumber": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$"
    },
    "supplier": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "deliveryDate": {
      "type": "string",
      "format": "date"
    },
    "site": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "worker": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "identifier"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "identifier": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      }
    },
    "voiceTranscript": {
      "type": "string",
      "maxLength": 20000
    },
    "rawOcrText": {
      "type": "string",
      "maxLength": 20000
    },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "poItemId",
          "description",
          "quantity",
          "receivedQuantity",
          "damagedQuantity"
        ],
        "properties": {
          "poItemId": {
            "type": "string",
            "format": "uuid"
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          "quantity": {
            "type": "number",
            "exclusiveMinimum": 0,
            "multipleOf": 0.001
          },
          "receivedQuantity": {
            "type": "number",
            "minimum": 0,
            "multipleOf": 0.001
          },
          "damagedQuantity": {
            "type": "number",
            "minimum": 0,
            "multipleOf": 0.001
          },
          "remarks": {
            "type": "string",
            "maxLength": 1000
          }
        }
      }
    }
  }
}
```

---

## 4. Validation rules

### 4.1 Blocking and non-blocking checks

| Situation | Result | Code |
| --- | --- | --- |
| PO not found | block | `ORDER_NOT_FOUND` |
| PO cancelled | block | `ORDER_CANCELLED` |
| PO already closed/fully received | block | `ORDER_NOT_OPEN` |
| Delivery note already recorded for this PO | block | `DELIVERY_ALREADY_RECORDED` |
| Supplier does not match the PO | block | `SUPPLIER_MISMATCH` |
| Site does not match the PO | block | `SITE_MISMATCH` |
| Note item does not match a PO line | block | `UNKNOWN_ITEM` |
| One note item matches multiple PO lines | block | `AMBIGUOUS_ITEM` |
| Two note lines map to the same PO line | block | `DUPLICATE_ITEM` |
| Received good quantity exceeds remaining PO quantity | block | `OVER_RECEIPT` |
| `receivedQuantity + damagedQuantity > quantity` on create | block | `INVALID_QUANTITY` |
| Delivery date missing or not ISO | block | `INVALID_DATE` |
| Delivery date differs from the PO's expected date | warning | `DELIVERY_DATE_VARIANCE` |
| Note quantity is less than the PO remaining quantity | allowed | — |
| PO has items not listed on the note | allowed | — |

The date-variance exception exists because late and early deliveries are normal. Every other mismatch blocks the worker.

### 4.2 Issue shape

Every issue should include enough information for the app to show the worker exactly what to fix.

```json
{
  "severity": "error",
  "code": "SUPPLIER_MISMATCH",
  "field": "supplier",
  "actual": "Acme Supply Co",
  "expected": "Acme Supplies",
  "message": "Supplier does not match the purchase order."
}
```

For an item issue:

```json
{
  "severity": "error",
  "code": "UNKNOWN_ITEM",
  "field": "items[2]",
  "actual": "Ceramic tiles",
  "message": "Item does not match any line on PO-1042."
}
```

For an over-receipt:

```json
{
  "severity": "error",
  "code": "OVER_RECEIPT",
  "field": "items[0].quantity",
  "actual": 60,
  "expectedMax": 40,
  "message": "Received quantity exceeds the remaining quantity on the purchase order."
}
```

### 4.3 Normalization

- Trim and uppercase `poNumber` and `deliveryNoteNumber`; collapse repeated internal whitespace.
- Trim supplier/site, collapse whitespace, and compare case-insensitively.
- Match items by `poItemId` when supplied; otherwise match by normalized exact description. If zero or multiple PO items match, block with `UNKNOWN_ITEM` or `AMBIGUOUS_ITEM`.
- Parse dates with `time.Parse("2006-01-02", value)`.
- Parse quantities as decimals with up to three decimal places. Never use `float64` for stock totals; use `json.Number` plus a decimal parser or `pgtype.Numeric`.

### 4.4 Client behaviour

- Call validate after OCR and after any edit to the note fields.
- Disable “Confirm delivery” unless the latest validation returned `valid: true`.
- Invalidate the validation result whenever the worker edits a field; require re-validation before confirming.
- On create failure, return to the review screen with the server's issues.

---

## 5. API contracts

### 5.1 `POST /api/v1/orders/validate`

**Request**

```json
{
  "poNumber": "PO-1042",
  "deliveryNoteNumber": "DN-1042",
  "supplier": "Acme Supplies",
  "deliveryDate": "2026-11-06",
  "site": "Riverside Tower",
  "items": [
    {
      "description": "Cement bags",
      "quantity": 50,
      "receivedQuantity": 48
    },
    {
      "description": "Steel rebar",
      "quantity": 20,
      "receivedQuantity": 20
    }
  ],
  "rawOcrText": "DELIVERY NOTE DN-1042\nPO No: PO-1042\n..."
}
```

**Response — `200 OK`**

Business-invalid results still return `200`; they are not HTTP errors.

```json
{
  "valid": false,
  "order": {
    "poNumber": "PO-1042",
    "supplier": "Acme Supplies",
    "site": "Riverside Tower",
    "status": "open",
    "expectedDeliveryDate": "2026-11-10",
    "items": [
      {
        "id": "8f3c8a1e-4b3d-4f6a-9c2e-1a2b3c4d5e6f",
        "lineNumber": 1,
        "description": "Cement bags",
        "orderedQuantity": 50,
        "receivedQuantity": 10,
        "damagedQuantity": 0,
        "remainingQuantity": 40
      }
    ]
  },
  "deliveryNote": {
    "number": "DN-1042",
    "alreadyRecorded": false
  },
  "issues": [
    {
      "severity": "error",
      "code": "SUPPLIER_MISMATCH",
      "field": "supplier",
      "actual": "Acme Supply Co",
      "expected": "Acme Supplies",
      "message": "Supplier does not match the purchase order."
    }
  ]
}
```

**Status codes**

| Status | Meaning |
| --- | --- |
| `200` | Validation completed. Inspect `valid` and `issues`. |
| `400` | Malformed JSON or missing required fields. |
| `500` | Internal server error. |

A non-empty date that is not ISO-formatted is a business validation failure, so it returns `200` with `valid: false` and an `INVALID_DATE` issue. A missing date is a required-field error and returns `400`.

When the PO exists, return the full PO and items even if validation failed, so the app can populate `poItemId` and show expected values. When the PO does not exist, `order` is `null`.

### 5.2 `POST /api/v1/deliveries`

**Request**

```json
{
  "clientRequestId": "b3b1c2d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "poNumber": "PO-1042",
  "deliveryNoteNumber": "DN-1042",
  "supplier": "Acme Supplies",
  "deliveryDate": "2026-11-06",
  "site": "Riverside Tower",
  "worker": {
    "name": "Pranjal",
    "identifier": "pranjal@example.com"
  },
  "voiceTranscript": "48 cement bags received, 2 damaged and set aside. Rebar all 20 received.",
  "items": [
    {
      "poItemId": "8f3c8a1e-4b3d-4f6a-9c2e-1a2b3c4d5e6f",
      "description": "Cement bags",
      "quantity": 50,
      "receivedQuantity": 48,
      "damagedQuantity": 2,
      "remarks": "Two torn bags set aside."
    }
  ]
}
```

**Response — `201 Created`**

```json
{
  "id": "c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c",
  "idempotentReplay": false,
  "orderStatus": "partially_received",
  "recordedAt": "2026-11-06T10:15:00Z"
}
```

**Status codes**

| Status | Meaning |
| --- | --- |
| `201` | Delivery recorded. |
| `200` | Idempotent replay for the same `clientRequestId`; returns the existing delivery and `idempotentReplay: true`. |
| `400` | Malformed JSON or missing required fields. |
| `409` | The same delivery note is already recorded for this PO under a different request ID. |
| `422` | Strict validation failed. The body contains the same `issues` array as the validation endpoint. |
| `500` | Internal server error. |

### 5.3 Error envelope

For HTTP errors:

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
        "actual": "Acme Supply Co",
        "expected": "Acme Supplies",
        "message": "Supplier does not match the purchase order."
      }
    ]
  }
}
```

Field-level shape errors can use a simpler payload:

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

---

## 6. Database schema

`backend/migrations/00002_purchase_orders_and_deliveries.sql`

```sql
-- +goose Up
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL UNIQUE,
    supplier_name TEXT NOT NULL,
    site_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'partially_received', 'closed', 'cancelled')),
    expected_delivery_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    ordered_quantity NUMERIC(12,3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    damaged_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_request_id TEXT UNIQUE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    po_number TEXT NOT NULL,
    delivery_note_number TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    site_name TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    worker_name TEXT NOT NULL,
    worker_identifier TEXT NOT NULL,
    voice_transcript TEXT,
    raw_ocr_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (purchase_order_id, delivery_note_number)
);

CREATE TABLE delivery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    purchase_order_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
    description TEXT NOT NULL,
    note_quantity NUMERIC(12,3) NOT NULL CHECK (note_quantity > 0),
    received_quantity NUMERIC(12,3) NOT NULL CHECK (received_quantity >= 0),
    damaged_quantity NUMERIC(12,3) NOT NULL CHECK (damaged_quantity >= 0),
    remarks TEXT,
    CHECK (received_quantity + damaged_quantity <= note_quantity),
    UNIQUE (delivery_id, purchase_order_item_id)
);

CREATE INDEX deliveries_po_created_idx
    ON deliveries (purchase_order_id, created_at DESC);

CREATE INDEX deliveries_worker_idx
    ON deliveries (worker_identifier, created_at DESC);

-- +goose Down
DROP TABLE delivery_items;
DROP TABLE deliveries;
DROP TABLE purchase_order_items;
DROP TABLE purchase_orders;
```

### 6.1 Status recomputation

After inserting the delivery and its items, update the PO line counters and recompute the PO status in the same transaction:

```sql
UPDATE purchase_order_items
SET received_quantity = received_quantity + $received,
    damaged_quantity  = damaged_quantity + $damaged
WHERE id = $poItemId;

UPDATE purchase_orders po
SET status = CASE
    WHEN po.status = 'cancelled' THEN 'cancelled'
    WHEN NOT EXISTS (
        SELECT 1
        FROM purchase_order_items i
        WHERE i.purchase_order_id = po.id
          AND i.received_quantity < i.ordered_quantity
    ) THEN 'closed'
    WHEN EXISTS (
        SELECT 1
        FROM purchase_order_items i
        WHERE i.purchase_order_id = po.id
          AND (i.received_quantity > 0 OR i.damaged_quantity > 0)
    ) THEN 'partially_received'
    ELSE 'open'
END,
updated_at = now()
WHERE po.id = $poId;
```

### 6.2 Transaction and idempotency

`POST /deliveries` runs in one transaction:

1. Begin transaction.
2. Lock the PO and its items with `SELECT ... FOR UPDATE`.
3. Re-run the strict validation.
4. Insert the `deliveries` row.
5. Insert the `delivery_items` rows.
6. Update `purchase_order_items` counters.
7. Recompute `purchase_orders.status`.
8. Commit.

Idempotency:

- `client_request_id` is unique. A retry with the same value returns the existing delivery with `200`.
- `(purchase_order_id, delivery_note_number)` is unique. A different request ID with the same note returns `409`.
- Row locks prevent two workers from over-receiving the same PO concurrently.

---

## 7. Backend implementation plan

### 7.1 Files

| File | Purpose |
| --- | --- |
| `backend/api/schemas/delivery-note.schema.json` | Formal scanned-note schema |
| `backend/api/schemas/delivery-record.schema.json` | Formal create-record schema |
| `backend/migrations/00002_purchase_orders_and_deliveries.sql` | Tables and indexes |
| `backend/scripts/seed_dev.sql` | Sample PO data for demos |
| `backend/internal/store/deliveries.go` | PO lookup, duplicate check, transactional insert, status recompute |
| `backend/internal/service/deliveries.go` | Normalization, strict comparison, issue construction |
| `backend/internal/httpapi/deliveries.go` | Request/response DTOs and handlers |
| `backend/internal/httpapi/deliveries_test.go` | Handler tests with a fake service |
| `backend/internal/service/deliveries_test.go` | Validation and status-rule tests |
| `backend/internal/httpapi/router.go` | Register the two routes |
| `backend/README.md` | Endpoint documentation and curl examples |

### 7.2 Service interface

```go
type DeliveryService interface {
    Validate(ctx context.Context, in ValidateInput) (ValidationResult, error)
    Create(ctx context.Context, in CreateInput) (CreateResult, error)
}
```

Keep `NewRouter(cfg, db)` unchanged so the existing health and ping tests, which pass a `nil` pool, still compile. Handler tests inject a fake `DeliveryService`.

### 7.3 Implementation order

1. Create the migration and verify `migrate-up` / `migrate-down`.
2. Add the two JSON Schema files.
3. Add domain types and the store layer.
4. Add the service layer with strict validation.
5. Add HTTP DTOs and handlers.
6. Register the routes in `router.go`.
7. Add the seed script and a `make seed` target.
8. Write handler and service tests.
9. Update `README.md`.
10. Run `make fmt`, `make vet`, `make test`, and `go build ./...`.

### 7.4 Seed data

`backend/scripts/seed_dev.sql` should create at least one PO that matches a sample scanned note, for example:

```sql
INSERT INTO purchase_orders
    (po_number, supplier_name, site_name, status, expected_delivery_date)
VALUES
    ('PO-1042', 'Acme Supplies', 'Riverside Tower', 'open', '2026-11-10')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO purchase_order_items
    (purchase_order_id, line_number, description, ordered_quantity)
SELECT id, 1, 'Cement bags', 50
FROM purchase_orders
WHERE po_number = 'PO-1042'
ON CONFLICT (purchase_order_id, line_number) DO NOTHING;

INSERT INTO purchase_order_items
    (purchase_order_id, line_number, description, ordered_quantity)
SELECT id, 2, 'Steel rebar', 20
FROM purchase_orders
WHERE po_number = 'PO-1042'
ON CONFLICT (purchase_order_id, line_number) DO NOTHING;
```

Add `make seed` for Docker Postgres and `make seed-local` for a locally
installed PostgreSQL.

---

## 8. Testing plan

### 8.1 Validation tests

- Valid note with exact PO match returns `valid: true`.
- PO not found returns `valid: false` with `ORDER_NOT_FOUND`.
- Cancelled PO returns `valid: false`.
- Fully received PO returns `valid: false`.
- Duplicate delivery note returns `valid: false`.
- Supplier mismatch returns `valid: false` with actual/expected values.
- Site mismatch returns `valid: false`.
- Unknown item returns `valid: false`.
- Ambiguous item returns `valid: false`.
- Two note lines mapping to the same PO line return `valid: false`.
- Quantity over remaining returns `valid: false`.
- Partial delivery returns `valid: true`.
- Note missing a PO line returns `valid: true`.
- Date variance returns `valid: true` with a warning.

### 8.2 Create tests

- Happy path creates the delivery, items, updates counters, and sets `partially_received`.
- Full receipt sets `closed`.
- Damaged-only receipt does not close the PO.
- Same `clientRequestId` returns `200` with `idempotentReplay: true`.
- Same delivery note with a different request ID returns `409`.
- Strict mismatch returns `422` and leaves the PO unchanged.
- `receivedQuantity + damagedQuantity > quantity` returns `422`.
- Invalid quantity scale returns `422`.
- Transaction rollback leaves counters unchanged on any failure.

### 8.3 HTTP tests

- `400` for malformed JSON.
- `400` for missing required fields.
- `200` with `valid: false` and `INVALID_DATE` for a malformed non-empty date; `400` when the date is missing.
- `500` for an internal service error.
- `201` for a successful create.

### 8.4 Integration tests

Optional Postgres integration tests gated on `TEST_DATABASE_URL`; these are not
added yet. The real-database checks currently rely on the manual acceptance
checklist in section 11.

Run:

```bash
cd backend
make fmt
make vet
make test
go build ./...
```

---

## 9. App-side changes required for end-to-end delivery

**Implemented.** The review screen now captures the PO number, normalizes the
date, validates against the backend, maps PO item IDs, and records the delivery
with idempotent retries. The original checklist is kept below as the
implementation record:

1. Add `poNumber` to `DeliveryNoteDetails` in `app/src/lib/deliveryNote.ts`.
2. Extract PO numbers in OCR. Reuse the existing label/value logic with a `PO_LABEL` pattern covering `PO`, `PO No.`, `Purchase Order`, and `Order Ref`.
3. Add a required “PO number” field to the review screen in `app/src/app/delivery-note.tsx`.
4. Normalize `deliveryDate` to `YYYY-MM-DD` before calling the API. The backend rejects free-form dates.
5. Add `app/src/lib/api.ts` with `EXPO_PUBLIC_API_URL`, `validateDeliveryNote()`, and `createDelivery()`.
6. Gate confirmation on a successful validation and re-validate after any edit.
7. Send `worker.name` and `worker.identifier` from the existing route params. No auth token in the MVP.
8. Generate a `clientRequestId` for each create attempt and reuse it on retries.
9. Derive `receivedQuantity` and `damagedQuantity` from the item’s `Qty`, `Damaged`, and `Received` fields; damaged units are excluded from PO fulfilment.
10. Handle `409` and `422` responses by returning to the review screen with the server's issues.

---

## 10. Assumptions and out of scope

### Assumptions

- One delivery note maps to one PO.
- The PO number is printed on the note or manually entered by the worker.
- Partial deliveries are allowed; every item on the note must match a PO line.
- Date variance is a warning, not a block.
- Worker identity is self-reported and stored as text. No auth and no `users` foreign key.
- No supervisor override in the MVP.
- The scanned photo is never uploaded; only structured fields, optional OCR text, and optional voice transcript are sent.
- The supervisor dashboard reads orders through `GET /api/v1/orders`; that route is separate from the two delivery routes.

### Out of scope

- Supervisor order writes and cancellation endpoints.
- Authentication and authorization.
- Offline queue and background sync on the app.
- Server-side OCR or speech-to-text.
- Supervisor override workflow.
- Multiple POs on a single delivery note.
- Supplier/site master tables.

---

## 11. Acceptance criteria

- `migrations/00002_purchase_orders_and_deliveries.sql` applies and rolls back cleanly.
- `POST /api/v1/orders/validate` returns `valid: true` for the seeded sample note and PO.
- Supplier, site, item, quantity, duplicate-note, and PO-status mismatches each return `valid: false` with the correct issue code.
- `POST /api/v1/deliveries` creates a record, updates PO item counters, and recomputes the PO status in one transaction.
- Retrying with the same `clientRequestId` returns `200` and does not duplicate the record.
- Reusing a delivery note with a different request ID returns `409`.
- A strict validation failure on create returns `422` and leaves the PO unchanged.
- `make fmt`, `make vet`, `make test`, and `go build ./...` pass.
- `README.md` documents both routes with request/response examples.
- The app captures a required PO number, normalizes the delivery date, disables
  confirmation until validation succeeds, maps PO item IDs from the validation
  response, and reuses `clientRequestId` on retries.
- The app returns to review with the server's issues on `409` and `422`.

The database-backed acceptance checks remain pending because PostgreSQL is not
installed in the current environment. The app flow has passed TypeScript and
lint checks but has not yet been exercised on a device against the live API.
