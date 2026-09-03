# AI LIVE + STORAGE SMOKE — Result

> **Status: NOT EXECUTED (no real credentials available).**
> Final verdict: **`LIVE_AI_SMOKE = FAIL`** — live execution could not be attempted.

This document follows the two controlling rules literally:

1. We never fabricated a PASS: a real provider/storage request was **not** executed.
2. We never printed, logged, or persisted any secret (no API key, no Firebase credential, no `.env`).

---

## Environment gate (checked first)

| Credential env-var | Status |
| ------------------ | ------ |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GOOGLE_GEMINI_API_KEY` | **not set** |
| `FIREBASE_PROJECT_ID` | **not set** |
| `FIREBASE_CLIENT_EMAIL` | **not set** |
| `FIREBASE_PRIVATE_KEY` | **not set** |
| `GOOGLE_APPLICATION_CREDENTIALS` | **not set** |
| `FIREBASE_STORAGE_BUCKET` | **not set** |
| `.env` / `.env.local` / `.env.production.local` file | absent (only `.env.example`) |

Anything disabled above disables the corresponding test. In particular:
- **Tests A & B (Real Gemini)** need `GEMINI_API_KEY` (+ correct `AI_PROVIDER=gemini`). Without a key the provider cannot be a *real* provider.
- **Tests C–H (Storage/Asset/Publish/Replay)** need Firebase Admin to bootstrap
  (`FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`, or `GOOGLE_APPLICATION_CREDENTIALS`), because `PenyimpananGambarFirebase` calls `getStorage()` which requires a bootstrapped Firebase app.

Firebase Admin itself (`src/infrastructure/firebase/admin.ts`, `bangunBootstrapFirebase`) **hard-fails** when no credential is present, so a real storage object cannot even be constructed — proving the gate is not a fluke.

---

## Static wiring verification (what IS confirmed)

These are structural checks performed without any network/secret. They prove the code path is in place and runnable once credentials are supplied.

| Probe | Result |
| ----- | ------ |
| Composition root imports `PenyimpananGambarFirebase` | `true` |
| Composition root builds `penyimpananGambar` (lazy, gated on `konfigurasiAi.imageReady`) | `true` |
| `penyimpananGambar` is passed into `LayananProduksiKasus` | `true` |
| `api/admin.ts` `publishCase` has the Part C asset-manifest gate | `true` |
| Storage adapter implements `simpan()` / `ada()` and bucket handling | `true` |
| Full unit/integration suite (`npx tsx --test`) | 261 passed / 0 failed |
| `npx tsc --noEmit` | exit 0 |

---

## Test matrix (live)

| Test             | Result        | Evidence | Notes |
| ---------------- | ------------- | -------- | ----- |
| Real Text        | **NOT EXECUTED** | no `GEMINI_API_KEY` | 0 requests sent. Provider is `gemini`; adapter `GeminiTextProvider` available but cannot call a real endpoint without a key. |
| Real Image       | **NOT EXECUTED** | no `GEMINI_API_KEY` | 0 requests sent. `GeminiImageProvider` available; needs key + `AI_IMAGE_MODEL`. |
| Firebase Storage | **NOT EXECUTED** | no Firebase credentials/bucket | `PenyimpananGambarFirebase` cannot initialize (`getStorage()` requires bootstrapped Firebase app). |
| Dedup            | **NOT EXECUTED** | requires Tests B+C | Identity `caseId:sceneId:planId` → `sanitasiKunci` maps to `assets/cases/…/….png`; dedup logic in `hasilkanAsetGambar` verified statically. |
| Case Generation  | **NOT EXECUTED** | requires Test A + Firebase persist | `generateCase` gate `caseGenerationEnabled` requires valid key. |
| Asset Handoff    | **NOT EXECUTED** | requires Tests B+C | `bytesBase64 → penyimpanan.simpan → AsetVisual metadata` path present (see unit test `ai-gemini-adapters`). |
| Publish          | **NOT EXECUTED** | requires A–F + admin token | Part C gate verified statically & via integration test (AI candidate without assets → 422). |
| Replay           | **NOT EXECUTED** | requires A–G | Dedup/cache path verified statically only. |

---

## Required report fields

| Field | Value |
| ----- | ----- |
| Provider | `gemini` (configured), **no real request executed** |
| Model (configured) | text: `AI_TEXT_MODEL` default `gemini-flash-latest`; image: `AI_IMAGE_MODEL` default `gemini-3.1-flash-image` *(not confirmed by a live call)* |
| Latency | none (0 requests) |
| Retry count | none |
| Asset size | none |
| Storage reference type | `gs://<bucket>/assets/cases/<case>/<scene>/<plan>.png` (design, not written) |
| Number of AI calls | 0 |
| Number of image calls | 0 |
| Replay caused additional provider calls? | n/a (no live run) |
| Quota / rate-limit observations | none (no requests) |

---

## Why no PASS is claimed

Per instruction: *"Do not claim PASS if a real provider/storage request was not actually executed."*

No real request was executed because the required credentials are absent from this environment. Claiming PASS, or running against the offline/fake provider and reporting it as live, would be dishonest and is explicitly forbidden. Nothing was fabricated.

---

## How to run for real (operator runbook)

Set these in the environment (never commit them; `.env` is gitignored):

```
# Gemini (Tests A, B)
AI_PROVIDER=gemini
GEMINI_API_KEY=<your key>
AI_TEXT_MODEL=gemini-flash-latest
AI_IMAGE_MODEL=gemini-3.1-flash-image

# Firebase (Tests C+; required for storage)
FIREBASE_PROJECT_ID=<project>
FIREBASE_CLIENT_EMAIL=<service account email>
FIREBASE_PRIVATE_KEY=<-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY----->

# Storage bucket (optional; defaults to project default bucket)
FIREBASE_STORAGE_BUCKET=<project>.appspot.com

# Admin (Test G)
ADMIN_SECRET_TOKEN=<32+ chars>
```

Then re-run this live smoke and regenerate this report. The smoke harness intentionally:
- performs **at most 1** text request and **at most 1** image request,
- uses a **non-sensitive** trivial prompt,
- verifies each contract (structured output, MIME, size, durable ref, Firestore-metadata-only, dedup identity `caseId:sceneId:planId`, DRAFT-then-publish ordering, replay reuse),
- does **not** auto-publish before asset verification,
- will fail (report non-PASS) if a repeated/replay step triggers a new image generation.

---

## Final verdict

```
LIVE_AI_SMOKE = FAIL   (NOT EXECUTED — no real credential/storage request was run)
```

Do **not** treat this as a pass. The production wiring is present and unit/integration green (261/261), but live AI + storage behavior is **unverified** until the credentials above are provided and this smoke is re-run in a credentialed environment.