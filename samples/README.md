# Sample delivery note for testing

A clean, camera-ready delivery note that matches the development seed data in
`backend/scripts/seed_dev.sql`.

## Files

| File | Use |
| --- | --- |
| `delivery-note-DN-2086.pdf` | Print at 100% / A4, or open full-screen on another display |
| `delivery-note-DN-2086.png` | Show on a phone/tablet or another screen |
| `delivery-note.html` | Source file if you want to change the sample |

## Test data

| Field | Value |
| --- | --- |
| PO number | `PO-1042` |
| Delivery note number | `DN-2086` |
| Supplier | `Acme Supplies` |
| Site | `Riverside Tower` |
| Delivery date | `10 November 2026` |
| Items | `Cement bags` × 50, `Steel rebar` × 20 |

The date matches the seeded PO's expected delivery date (`2026-11-10`), so a
fresh seed should validate with no warnings.

## Before scanning

Start the backend and load the seed data once:

```bash
# Docker
cd backend
make seed

# Or local PostgreSQL
make seed-local
```

Make sure the app's `EXPO_PUBLIC_API_URL` points at the running backend.

## Expected result in the app

After OCR, the review screen should show:

```text
PO number:            PO-1042
Delivery note number: DN-2086
Supplier:             Acme Supplies
Delivery date:        10 November 2026 (2026-11-10)
Site:                 Riverside Tower
Items:
  Cement bags   50
  Steel rebar   20
```

Validation should pass, and **Confirm delivery** should record the note.

## Repeat tests

- `DN-2086` can only be recorded once for this PO. For another confirmation,
  change the note number in the review screen before confirming, or reset the
  database.
- These quantities are the full order. Confirming them will close the PO, so
  later scans of `PO-1042` will fail with `ORDER_NOT_OPEN`. Reseed/reset the PO
  for another full test, or edit the quantities to partial values (for example
  20 and 10) before confirming.
- To test the date-variance warning, change the date to a different day. The
  backend returns a warning, but the delivery is still valid.

## Voice-correction phrases to try

Open **Speak corrections** and say one of these:

- “Supplier is Acme Supplies.”
- “Delivery date is 10 November 2026.”
- “Cement bags quantity is 48.”
- “Steel rebar quantity 18.”
- “Remove steel rebar.”
- “Add paint buckets quantity 6.”

For a scoped field test, tap the mic on **Supplier**, **Delivery date**, or an
item, then dictate just that value.
