# Plan: Gnani voice correction for delivery notes

## 1. Target flow

Keep the existing scan → review → validate → confirm flow, and insert voice correction into the review stage:

1. Worker scans the delivery note; on-device OCR fills the draft.
2. App validates the draft against the backend `/api/v1/orders/validate`.
3. The review screen shows a **Fix with voice** card, driven by:
   - locally missing fields,
   - backend validation issues and expected values,
   - PO item descriptions returned by the backend when the PO is found.
4. Worker can either:
   - tap a mic button on a specific field/item, or
   - open the **Speak corrections** sheet and describe multiple corrections in one utterance.
5. Gnani transcribes the audio. The app proposes field changes; the worker can edit the transcript, select which changes to apply, then apply them.
6. Applying changes invalidates the old validation and the existing debounced validation effect re-runs automatically.
7. Confirmation stays blocked until validation succeeds. On confirm, the aggregated voice transcript is sent to `/api/v1/deliveries` in the already-supported `voiceTranscript` field.

Important: voice input must **not** be gated on `valid === true`. Missing fields are one of the main reasons to use voice, so the card is available whenever a draft exists. Once the backend has found the PO, the PO context is used to improve parsing and show expected values.

No backend changes are required.

---

## 2. Files to add or change

### New files

| File | Purpose |
| --- | --- |
| `app/src/lib/gnaniStt.ts` | Gnani REST client, multipart upload, error mapping, config |
| `app/src/lib/voiceFill.ts` | Pure helpers: voice targets, scoped value normalization, free-form transcript parsing, applying changes |
| `app/src/hooks/useVoiceRecorder.ts` | Microphone permission, recording lifecycle, 30-second cap, cleanup |
| `app/src/components/VoiceFixCard.tsx` | Review-screen card: needs-attention list, scoped mic actions, free-form entry point |
| `app/src/components/VoiceCorrectionSheet.tsx` | Modal recorder + transcript editor + proposed-change confirmation UI |

### Files to modify

| File | Change |
| --- | --- |
| `app/package.json` | Add `expo-audio` via `npx expo install expo-audio` |
| `app/app.json` | Add the `expo-audio` config plugin with a microphone permission message |
| `app/.env.example` | Document `EXPO_PUBLIC_GNANI_API_KEY` and optional STT settings |
| `app/.env.local` | Store the real key locally; already covered by `.env*.local` in `.gitignore` |
| `app/src/components/FormField.tsx` | Optional mic button, recording/transcribing state, accessibility label |
| `app/src/app/delivery-note.tsx` | Wire voice sheet, scoped updates, transcript history, final `voiceTranscript` |
| `app/src/app/worker-dashboard.tsx` | Update the delivery-note card copy to mention voice correction |

No backend files need to change.

---

## 3. Configuration

### Dependencies

```bash
cd app
npx expo install expo-audio
```

`expo-audio` is included in Expo Go, but the app already needs a development build for `expo-text-extractor`. Add the config plugin and regenerate the native project:

```json
[
  "expo-audio",
  {
    "microphonePermission": "Allow Crewline to use your microphone to dictate delivery details.",
    "recordAudioAndroid": true
  }
]
```

Then run `npx expo prebuild --platform android` or `npx expo run:android` so `RECORD_AUDIO` and the iOS usage description are included.

### Environment

`.env.example`:

```bash
# Gnani Speech-to-Text. EXPO_PUBLIC values are embedded in the app bundle.
EXPO_PUBLIC_GNANI_API_KEY=
# Optional. en-IN handles English/Hinglish and returns Latin-script output.
EXPO_PUBLIC_GNANI_STT_LANGUAGE=en-IN
```

Implementation details:

- Read the key with `process.env.EXPO_PUBLIC_GNANI_API_KEY`.
- Use `.env.local` for the real key, copied from `notes.txt`. `.env*.local` is already ignored.
- Because it is `EXPO_PUBLIC_*`, Expo inlines it into the JS bundle at build time. It is embedded as requested, but it is not secret.
- For EAS builds, set `EXPO_PUBLIC_GNANI_API_KEY` in the build environment too.
- Do not commit the key. If `notes.txt` is ever committed, rotate the key.

---

## 4. Gnani STT client

**File:** `app/src/lib/gnaniStt.ts`

Use the REST endpoint, not WebSocket:

```text
POST https://api.vachana.ai/stt/v3
X-API-Key-ID: <embedded key>
Content-Type: multipart/form-data
```

Recommended multipart fields:

| Field | Value |
| --- | --- |
| `audio_file` | Recorded M4A/AAC file |
| `model` | `prisma-v3.0` |
| `language_code` | `EXPO_PUBLIC_GNANI_STT_LANGUAGE` or `en-IN` |
| `format` | `transcribe` — needed for digits, dates, and quantities |
| `topic` | `Warehouse delivery note correction` |
| `keyterms` | JSON array of field labels and current PO item descriptions, if available |

`format=transcribe` is the key setting: it turns spoken numbers and dates into usable text such as `48` and `6 November 2026`.

Client API:

```ts
type GnaniTranscript = {
  text: string;
  requestId: string;
  detectedLanguage?: string;
  truncated: boolean;
};

class GnaniSttError extends Error {
  code: GnaniSttErrorCode;
  status?: number;
}

isGnaniConfigured(): boolean
transcribeAudio(uri: string, options?: {
  keyterms?: string[];
  signal?: AbortSignal;
}): Promise<GnaniTranscript>
```

Behavior:

- Build `FormData` and append the audio as `{ uri, name, type }` on native.
- Derive the filename/type from the recording URI; default to `.m4a` / `audio/m4a`.
- Add a correlation ID with `X-API-Request-ID`.
- Use a 45-second timeout with `AbortController`.
- Parse `transcript`, `request_id`, `detected_language_code`, and `truncated`.
- Treat an empty transcript as a user-facing “didn’t catch that” error, not a crash.
- Map failures to friendly messages:
  - `401` → “Speech key is invalid or missing.”
  - `402/403` → “Speech credits or permissions are unavailable.”
  - `429` → “Speech service is busy; wait a moment and retry.”
  - `400 MAX_AUDIO_DURATION_EXCEEDED` → “Keep the recording under 30 seconds.”
  - `504` / network / 5xx → “Could not reach speech recognition. Try again.”
- Never log the API key or transcript.
- On web, return a clear “voice input is available in the mobile app” error. The mobile-only decision avoids WebM-to-WAV conversion.

---

## 5. Recorder hook

**File:** `app/src/hooks/useVoiceRecorder.ts`

Use `useAudioRecorder`, `useAudioRecorderState`, and `RecordingPresets.HIGH_QUALITY` from `expo-audio`:

- Request permission with `AudioModule.requestRecordingPermissionsAsync()`.
- Call `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })` when recording starts.
- Restore `allowsRecording: false` after stop.
- Record to the app cache directory.
- States: `idle`, `requesting-permission`, `permission-denied`, `recording`, `transcribing`, `error`.
- Enforce a 30-second maximum with an elapsed timer and automatic stop. Gnani rejects audio longer than 30 seconds.
- Reject recordings shorter than about 1 second with “Hold on, I didn’t hear anything.”
- Stop and release the recorder if the sheet closes or the screen unmounts.
- Guard against double taps while recording or transcribing.
- If permission is permanently denied, offer a button that opens device settings.

---

## 6. Voice targets and transcript parsing

**File:** `app/src/lib/voiceFill.ts`

### 6.1 Needs-attention targets

```ts
type VoiceTarget =
  | { kind: 'field'; field: EditableField; label: string; reason: string }
  | { kind: 'item'; itemId: string; label: string; reason: string };
```

`getVoiceTargets(draft, validationResult)` combines:

- locally missing/invalid fields,
- backend issues with `field` values such as `supplier`, `site`, `deliveryDate`, `items[i].description`, `items[i].quantity`,
- backend warnings are not treated as mandatory fixes,
- `ORDER_NOT_FOUND` targets the PO number,
- `SUPPLIER_MISMATCH` shows the expected supplier from `validationResult.order`,
- item issues target the matching draft item by index or description.

### 6.2 Scoped dictation

When the worker taps a specific mic, use the transcript as that field’s value:

- **PO / note numbers:** normalize spoken forms:
  - `PO 1042` → `PO-1042`
  - `P O 1042` → `PO-1042`
  - `DN 1042` → `DN-1042`
  - strip filler words such as “number”, “is”, “should be”.
- **Dates:** strip ordinals (`6th` → `6`) and pass through the existing `normalizeDeliveryDate`. The existing function already supports `6 November 2026` and `2026-11-06`.
- **Quantities:** extract a positive number. `format=transcribe` should already return digits; add a small fallback word-to-number map for zero through twenty if needed.
- **Supplier/site/description:** trim leading fillers such as “the supplier is” and trailing punctuation.
- If normalization fails, keep the raw transcript visible and let the worker edit it instead of applying an invalid value.

### 6.3 Free-form correction parsing

`parseVoiceCorrections(transcript, draft, orderItems)` returns proposals:

```ts
type VoiceChange = {
  id: string;
  kind: 'field' | 'item-description' | 'item-quantity' |
        'item-received' | 'item-add' | 'item-remove';
  label: string;
  from?: string;
  to?: string;
  itemId?: string;
  confidence: 'exact' | 'fuzzy';
};
```

Supported utterances:

- `supplier is Acme Supplies`
- `site is Riverside Tower`
- `PO number is PO 1042`
- `delivery note number is DN 1042`
- `delivery date is 6 November 2026`
- `cement bags quantity is 48`
- `received 48 cement bags`
- `cement bags are received` / `not received`
- `remove steel rebar`
- `add paint buckets quantity 6`

Parsing approach:

1. Normalize text and split into clauses on punctuation and on field-keyword boundaries.
2. Match field keywords with value capture; cut values at the next known keyword.
3. For item quantities, score the clause against current draft items and PO item descriptions using token overlap.
4. Only propose a fuzzy item match when one item is the clear best match; otherwise report “I couldn’t tell which item you meant.”
5. Handle “add” and “remove” explicitly.
6. Deduplicate proposals and produce human-readable `from → to` labels.
7. Never apply changes silently. The worker reviews checkboxes before applying.

The transcript remains editable in the sheet with a **Re-parse** button, so STT mistakes can be corrected without re-recording.

---

## 7. UI changes

### 7.1 `VoiceFixCard` on the review screen

Place it after the OCR notice and before the “Does this match the paper note?” intro.

- Header: **Fix with voice** with a small `GNANI STT` badge.
- If the key is missing: disabled state with “Voice input is not configured.”
- If there are targets: show compact rows/chips such as:
  - `Supplier` — “Backend expected Acme Supplies” → **Speak**
  - `Delivery date` — “Could not read the date” → **Speak**
  - `Cement bags` — “Quantity needs checking” → **Speak**
- Primary button: **Speak corrections** — opens the free-form sheet.
- Recent transcript count or last transcript preview.
- Privacy copy: “Audio is sent to Gnani for transcription. Crewline does not keep the recording.”
- Keep the existing visual language: white card, rounded corners, forest/sage palette.

### 7.2 `VoiceCorrectionSheet` modal

Bottom-sheet modal with two modes:

**Scoped mode** — opened from a field/item mic:

- Prompt: “Speak the supplier name” / “Speak the quantity for Cement bags”.
- Large record/stop button with timer.
- On success: transcript preview, optional editable text, **Use this value** and **Try again**.

**Free-form mode** — opened by **Speak corrections**:

- Prompt with examples.
- Record/stop, transcribing spinner.
- On success:
  - editable multiline transcript,
  - **Re-parse**,
  - list of proposed changes with checkboxes,
  - **Apply N changes**, **Try again**, **Discard**,
  - if no changes parsed, show examples and keep the transcript for manual editing.

States must include permission denied, not configured, recording, transcribing, empty transcript, API error, and retry.

### 7.3 `FormField`

Add optional props:

```ts
onVoicePress?: () => void;
voiceState?: 'idle' | 'recording' | 'transcribing' | 'disabled';
```

Render a mic icon inside the input shell. Disable it while submitting, recording elsewhere, or when voice is unavailable. Add an accessibility label such as “Dictate supplier”.

### 7.4 Item rows

Add one mic button per item in `itemTopRow`, next to the Received control. It opens the sheet in item mode. A single utterance can update both description and quantity:

- “Cement bags, forty eight”
- “Steel rebar quantity twenty”

This avoids adding two tiny mic buttons to the narrow description/quantity row. Quantity-only corrections are still supported by the free-form sheet and by a future field-level mic if needed.

---

## 8. `delivery-note.tsx` integration

Add state:

```ts
type VoiceTranscriptEntry = {
  target: string;
  text: string;
  createdAt: string;
};

const [voiceSheet, setVoiceSheet] = useState<{ visible: boolean; target?: VoiceTarget }>(...);
const [voiceTranscripts, setVoiceTranscripts] = useState<VoiceTranscriptEntry[]>([]);
```

Handlers:

- `openVoiceSheet(target?)`
- `handleApplyScopedValue(target, value)`:
  - update the draft field/item,
  - append the transcript entry,
  - clear relevant form errors,
  - call `invalidateValidation()`.
- `handleApplyVoiceChanges(changes, transcript)`:
  - apply all selected changes to the draft,
  - append the transcript entry,
  - clear errors for changed fields/items,
  - call `invalidateValidation()`.
- Reset voice state in `resetToCapture` and `handleExtracted`.

On confirm, pass the transcript to the existing API:

```ts
const voiceTranscript = voiceTranscripts
  .map((entry) => `[${entry.target}] ${entry.text}`)
  .join('\n');

await createDelivery({
  ...,
  voiceTranscript: voiceTranscript || undefined,
});
```

`api.ts` already accepts and truncates `voiceTranscript`, so no API-client signature change is needed.

After voice changes:

- the existing 500 ms debounced validation effect re-runs because `draft` changed,
- PO item IDs are re-derived from the new validation result on confirm,
- if a voice-added or renamed item cannot be matched to a PO line, the existing “could not be matched” error blocks confirmation.

Also update the header privacy badge. The current **ON-DEVICE** badge only describes OCR; voice is not on-device. Use something like **OCR ON-DEVICE · VOICE VIA GNANI** or a small note in the voice card so the worker understands audio leaves the device.

---

## 9. Backend integration summary

No backend implementation work is needed:

- `POST /api/v1/orders/validate` continues to validate the corrected draft.
- `POST /api/v1/deliveries` already accepts `voiceTranscript` as an optional string up to 20,000 characters.
- The existing `clientRequestId` idempotency behavior is unchanged.
- The existing error handling for `400/409/422` is unchanged.

If we later want the backend to parse voice transcripts or store per-utterance metadata, that is a separate backend change and can be added after the app flow works.

---

## 10. Security and privacy

Because the key is embedded in the mobile app:

- Treat it as public and extractable from the APK/IPA.
- Use a dedicated hackathon key with limited scope/quota.
- Keep it in `.env.local`, never in git.
- Set it as an EAS build environment variable for cloud builds.
- Rotate it if it is exposed.
- Consider a backend proxy later if this becomes a production feature.
- Disclose that audio is uploaded to Gnani for transcription.
- Do not persist recordings; delete or ignore the cache file after transcription.
- Never log the API key or full transcript.

---

## 11. Test plan

### Static checks

```bash
cd app
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

### Gnani API smoke test

Before wiring the UI, verify the key and audio format:

```bash
curl -X POST https://api.vachana.ai/stt/v3 \
  -H "X-API-Key-ID: $EXPO_PUBLIC_GNANI_API_KEY" \
  -F audio_file=@sample.m4a \
  -F model=prisma-v3.0 \
  -F language_code=en-IN \
  -F format=transcribe
```

### Manual device acceptance

1. Missing key → mic disabled with a clear message.
2. Deny mic permission → permission state with “Open settings” when applicable.
3. Record “Acme Supplies” for supplier → transcript, apply, supplier updates.
4. Record “PO 1042” → field becomes `PO-1042`.
5. Record “6th November 2026” → date becomes `2026-11-06`.
6. Record “cement bags quantity 48” → correct item quantity updates.
7. Record a multi-field utterance → proposed changes appear, can deselect individual changes.
8. Edit a bad transcript and tap Re-parse → corrected proposal appears.
9. Apply changes → validation re-runs automatically.
10. Full valid flow → delivery records successfully; backend receives `voiceTranscript`.
11. Empty/silent recording → friendly retry prompt.
12. 30-second auto-stop → API does not receive over-limit audio.
13. 401, 429, timeout, and offline cases → friendly errors and retry.
14. Close the sheet mid-recording → recorder stops and no late update lands.
15. Retake/reset → voice history and sheet state are cleared.
16. Web build → voice controls are disabled with “mobile app only” copy.

---

## 12. Suggested implementation order

1. Add `expo-audio`, app config, env example, and `.env.local`.
2. Build and smoke-test `gnaniStt.ts` against the Gnani endpoint.
3. Build the recorder hook.
4. Add `voiceFill.ts` helpers and validate them with sample transcripts.
5. Build `VoiceCorrectionSheet` and `VoiceFixCard`.
6. Add mic props to `FormField` and item rows.
7. Wire everything into `delivery-note.tsx`.
8. Pass `voiceTranscript` to `createDelivery`.
9. Update copy, privacy disclosure, and dashboard text.
10. Run typecheck, lint, expo-doctor, and device acceptance tests.

---

## 13. Out of scope

- Backend proxy or new backend endpoints.
- Gnani realtime WebSocket streaming.
- Web voice recording / WebM conversion.
- Text-to-speech.
- Language picker UI; default is `en-IN` with env override.
- Damaged-quantity capture and per-item remarks.
- Persisting audio or transcripts locally.
- Supervisor dashboard changes.

This keeps the change focused on the app, uses the existing backend validation/record contract, and gives the worker both a reliable per-field path and a faster free-form voice path.
