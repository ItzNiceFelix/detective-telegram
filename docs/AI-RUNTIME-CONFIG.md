# AI Runtime Config — Dynamic Provider Routing (tanpa redeploy)

**Status**: IMPLEMENTED (routing + Firestore config; provider baru belum live)
**Arsitektur**: `Application → RouterAi → Provider Adapter` (Gemini kini;
xKiro/Bitdeer = stub routing, tanpa adapter live).
**Aturan**: provider/model TIDAK diganti oleh milestone ini; kredensial TIDAK
pernah di Firestore; endpoint baru TIDAK dibuat (`/api/admin.ts` tak tersentuh).

---

## 1. Config schema

Dokumen Firestore: **`ai_runtime_config/production`** (server-side only).

```json
{
  "text": {
    "enabled": true,
    "provider": "gemini",
    "model": "gemini-flash-latest",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "maxInputTokens": 8192,
    "maxOutputTokens": 2400,
    "maxRetries": 2,
    "timeoutMs": 15000,
    "fallback": { "provider": "gemini", "model": "gemini-flash-lite-latest" }
  },
  "runtimeNarrative": { "enabled": false },
  "assistant": { "enabled": false },
  "image": { "enabled": false, "mode": "HUMAN_IN_LOOP" },
  "caseGeneration": { "enabled": true },
  "updatedAt": "2026-09-04T08:00:00.000Z",
  "updatedBy": "admin-ops"
}
```

Catatan schema:

- `text.provider`: `"gemini" | "xkiro" | "bitdeer" | "none"`. Nilai tak dikenal
  → dinormalisasi ke `"none"` (aman, bukan crash). `xkiro`/`bitdeer` → error
  eksplisit "belum diimplementasikan" (stub routing; JANGAN dikira live).
- `text.fallback`: opsional. Satu level primer→cadangan; aktif bila dikonfigurasi
  (multi-provider live BELUM diaktifkan — abstraksi saja).
- `text.maxInputTokens`: opsional. Absen = tanpa enforcement input (default,
  behavior Gemini lama tidak berubah).
- `text.baseUrl`: opsional. Absen = default provider.
- `image.mode`: hanya `"HUMAN_IN_LOOP"` (nilai lain ditolak validator).
- Field key-like (`apiKey`, `secret`, `token`, `password`, `credential`,
  varian camel/snake) di level mana pun → dokumen DITOLAK
  (`KesalahanKonfigurasi`). Matcher hati-hati: field budget legit
  (`maxOutputTokens`, `maxInputTokens`) tidak false-positive.

## 2. Defaults

Tanpa dokumen / baca gagal → default aman (semua fitur mati), dengan
`text.model`/`timeoutMs`/`maxRetries`/`maxOutputTokens` diwarisi dari env
(mapping 1:1 behavior lama bila `provider=gemini` + key valid):

| Field | Default |
|---|---|
| `text.enabled` | `false` |
| `text.provider` | `"none"` (atau `"gemini"` bila env legacy `AI_PROVIDER=gemini`) |
| `text.maxOutputTokens` | `2400` |
| `text.maxRetries` | `2` |
| `text.timeoutMs` | `15000` |
| `text.fallback` | absen (tanpa fallback) |
| `runtimeNarrative/assistant/image/caseGeneration.enabled` | `false` |
| `image.mode` | `"HUMAN_IN_LOOP"` |

## 3. TTL & cache behavior

- TTL **45 detik** (`TTL_KONFIGURASI_RUNTIME_MS`,
  `src/infrastructure/adapters/ai/router-ai.ts`).
- Dalam TTL: tanpa query Firestore (tanpa cost per request/token).
- Kedaluwarsa: refetch SEKALI; concurrent readers berbagi satu fetch
  (singleflight).
- Baca gagal: pakai last-known-good bila ada; bila belum ada → default env.
  Generate TIDAK pernah crash karena Firestore down (graceful DISABLED).
- Perubahan `provider`/`model`/`maxOutputTokens`/`timeoutMs` di Firestore
  berlaku pada request berikutnya setelah TTL (maks ~45 dtk) — tanpa restart
  maupun redeploy.

## 4. Feature flags (eksplisit, tanpa infer)

| Prompt / jalur | Syarat aktif |
|---|---|
| `case_generation` (`/generatecase`) | `text.enabled && caseGeneration.enabled` |
| `dialogue` (narrative) | `text.enabled && runtimeNarrative.enabled` |
| `hint` (assistant) | `text.enabled && assistant.enabled` |
| `visual_prompt` (text path) | `text.enabled && image.enabled` |
| `generateImages` (image adapter) | `image.enabled` (independen dari text) |

Nonaktif → `KesalahanProviderAi` kategori `DISABLED` (admin: 503).
Case Generation memakai TEXT AI independen dari image generation; image
generation TIDAK disyaratkan hanya karena text provider terkonfigurasi.

## 5. Provider selection & credential policy

- Seleksi di `RouterAi.adapterUntuk()`: `gemini` → `GeminiTextProvider`
  (adapter existing, dipertahankan); `xkiro`/`bitdeer` → throw jelas;
  `none` → `DISABLED`.
- Kredensial SELALU dari server env: `GEMINI_API_KEY` (kini),
  `XKIRO_API_KEY`/`BITDEER_API_KEY` (future). Firestore hanya
  provider/model/settings — TIDAK pernah key.
- Tanpa key untuk provider terpilih → `AUTHENTICATION` jelas (tanpa fallback
  diam-diam ke provider lain).
- Config/telemetri/error TIDAK pernah memuat key (diuji: serialisasi config
  + pesan error bersih dari secret).

## 6. Token budget

- `maxOutputTokens`: di-cap di router (`min(request, config)`) lalu di
  adapter (`generationConfig.maxOutputTokens`). TIDAK pernah dinaikkan diam-diam.
- `maxInputTokens` (bila diset): preflight `countTokens` otomatis aktif untuk
  pengukuran; estimasi > budget → `INVALID_RESPONSE` eksplisit SEBELUM generate
  (tanpa silent override, tanpa auto-increase).
- Tanpa `maxInputTokens` → tanpa preflight tambahan (behavior lama).

## 7. Timeout

- `timeoutMs` dari Firestore (batas validasi 1000–120000 ms; default konservatif 15000).
- Timeout provider → `KesalahanProviderAi` kategori `TIMEOUT` (terstruktur,
  layak retry terbatas sesuai `maxRetries`).

## 8. Observability

Setiap generate (sukses maupun gagal, mis. 429) mencetak `ai_generation_usage`
(lihat `docs/AI-PRODUCTION-IMPLEMENTATION.md`): provider, model (efektif dari
routing — ganti model terlihat di log), operation, token usage, latency
(`durationMs`), retry (`attempt`), status. Tanpa prompt/secret.

## 9. Admin procedure (tanpa endpoint baru)

Mutasi config = tulis dokumen Firestore langsung (console/gcloud) dengan IAM
terbatas — authenticated via GCP, bukan endpoint aplikasi (arsitektur tidak
meminta action admin baru; `/api/admin.ts` tak tersentuh):

1. Buka Firestore → `ai_runtime_config/production`.
2. Ubah field yang perlu (provider/model/budget/timeout/flags).
3. Isi `updatedAt` + `updatedBy` untuk audit.
4. Verifikasi dalam ≤60 dtk: panggil `/generatecase` (atau cek log
   `ai_generation_usage` → `model` baru).
5. JANGAN menulis field key-like apa pun (dokumen akan ditolak router).

## 10. Rollback to deterministic mode

Set `text.enabled: false` (atau hapus dokumen) → seluruh text AI DISABLED
dalam ≤45 dtk; gameplay kembali fully deterministik (Golden Case path).
Tanpa redeploy. Untuk rollback model saja: kembalikan `text.model` ke nilai
sebelumnya.

## 11. Tests

`tests/unit/ai-runtime-config.test.ts` (13 tests, tanpa API/GCP nyata):

1. config dimuat dari Firestore
2. default config (dokumen hilang → semua fitur mati)
3. Firestore meng-override default env
4. TTL cache (tanpa refetch dalam TTL; refetch setelah kedaluwarsa)
5. provider selection (gemini → endpoint Gemini)
6. model selection (model-A → model-B berlaku request berikut, tanpa restart)
7. token limits (output di-cap; input berlebih ditolak eksplisit)
8. timeout configuration (timeoutMs dipakai; timeout → TIMEOUT terstruktur)
9. disabled feature blocks generation
10. text enabled + image disabled (independen)
11. no provider key leakage (repo tolak doc ber-key; config/error bersih)
12. invalid config rejected safely (fallback default tanpa crash)
13. concurrent config reads safe (singleflight)
