# xKiro Text Provider — Detective Telegram

**Status**: IMPLEMENTED (provider kedua; Gemini tidak berubah)
**Arsitektur**: `Application → RouterAi → XkiroTextProvider` (kontrak `PintuAi` sama).
**Batasan v1**: non-streaming; text-only (`case_generation` aktif bila flag menyala;
image AI, runtime narrative, assistant TIDAK diaktifkan oleh provider ini).

---

## 1. Endpoint & auth

- Chat completions: `POST {baseUrl}/chat/completions` (default
  `https://api.xkiro.com/v1/chat/completions`).
- Preflight count (opsional): `POST {baseUrl}/messages/count_tokens`.
- Auth: `Authorization: Bearer <XKIRO_API_KEY>` — key dari server env
  (`XKIRO_API_KEY`), TIDAK pernah dari Firestore, TIDAK pernah di-log
  (header/body/telemetri/error bersih dari key — diuji).
- Tanpa SDK baru: raw `fetch` + boundary `xkiro-net.ts` (timeout `AbortSignal`).

Payload chat completions (non-streaming):

```json
{
  "model": "<dari runtime config>",
  "messages": [{ "role": "user", "content": "<prompt generik>" }],
  "max_tokens": 2400,
  "temperature": 0.4,
  "stream": false
}
```

## 2. Model selection

Model TIDAK di-hardcode — berasal dari `ai_runtime_config/production.text.model`
(Firestore). Model kosong → `MODEL_NOT_FOUND` eksplisit sebelum request.
`text.baseUrl` opsional meng-override base default (berguna untuk staging).

## 3. Free-tier behavior

- Smoke live (`tests/smoke-xkiro-live.ts`) membaca `/v1/models` dan memakai
  hanya model `access_tier === "free"`.
- TIDAK ada klaim free-unlimited; TIDAK ada klaim token allowance tetap —
  kuota mengikuti akun/API key masing-masing; 429 ditangani sebagai
  `QUOTA_RATE_LIMIT` (tanpa retry).

## 4. `/v1/usage` & `/v1/models`

- `/v1/models` (GET, Bearer): daftar model; smoke memfilter `access_tier`.
- `/v1/usage` (GET, Bearer): opsional — smoke melaporkan field keys + nilai
  terpotong 40 char (tanpa secret). Tidak dipakai untuk keputusan routing.

## 5. Token accounting

- Sumber utama: `usage` respons chat completions —
  `prompt_tokens` → `tokenInput`, `completion_tokens` → `tokenOutput`,
  `total_tokens` → `tokenTotal` (telemetri generik `ResponAi.usage`; tanpa
  `tokenThinking` — xKiro tidak melaporkannya).
- Bila usage absen → preflight `messages/count_tokens` (hanya bila
  `countTokensEnabled` atau `maxInputTokens` diset) sebagai estimasi
  `tokenInput`; bila keduanya absen → field `null` di log.
- TIDAK pernah duplicate generation untuk pengukuran.

## 6. Error mapping

| xKiro | Kategori | Retry |
|---|---|---|
| 400 | `INVALID_REQUEST` | tidak |
| 401 | `AUTHENTICATION` | tidak |
| 403 | `PERMISSION_DENIED` | tidak |
| 404 | `MODEL_NOT_FOUND` | tidak |
| 429 | `QUOTA_RATE_LIMIT` | tidak |
| 500/502/503 | `PROVIDER_UNAVAILABLE` | ya (bounded `maxRetries`, backoff 100/200/400ms) |
| timeout/abort | `TIMEOUT` | ya (bounded) |
| network | `PROVIDER_UNAVAILABLE` | ya (bounded) |
| content hilang / non-JSON body | `INVALID_RESPONSE` | tidak |
| context size melebihi budget | `INVALID_RESPONSE` eksplisit | tidak |

Retry loop tunggal di adapter (pola sama dengan Gemini); router TIDAK
menambah loop sendiri — fallback router hanya untuk
`TIMEOUT`/`PROVIDER_UNAVAILABLE` (satu percobaan ekstra ke provider cadangan
bila dikonfigurasi).

## 7. Rate limit

429 → `QUOTA_RATE_LIMIT`, tercatat di `ai_generation_usage` dengan
`attempt` + `status: 429` (diagnosa kuota), lalu dilempar ke pemanggil
(admin: 503 `provider_error`). Tanpa retry otomatis.

## 8. Structured output

`case_generation` meminta "hanya JSON valid" via instruksi prompt (kontrak
`PintuAi` generik — tanpa parameter structured-output provider-spesifik).
Adapter meneruskan content apa adanya; parse/validasi JSON tetap di domain
(`generasi-kasus.ts`): strict, tanpa recovery semantik. Game Engine tidak
tahu provider.

## 9. Configuration

Env (satu-satunya tambahan): `XKIRO_API_KEY` (lihat `.env.example`).
Firestore (`ai_runtime_config/production`):

```json
{
  "text": {
    "enabled": true,
    "provider": "xkiro",
    "model": "<model-id-case-generation>",
    "dialogueModel": "<model-id-runtime-narrative>",
    "hintModel": "<model-id-assistant>",
    "fallback": { "provider": "xkiro", "model": "<model-id-cadangan>" },
    "maxOutputTokens": 2400,
    "maxRetries": 1,
    "timeoutMs": 60000
  },
  "caseGeneration": { "enabled": true },
  "runtimeNarrative": { "enabled": false },
  "assistant": { "enabled": false },
  "image": { "enabled": false, "mode": "HUMAN_IN_LOOP" }
}
```

**Lock production (2026-09-04 Opsi 1, skema Case Bible wajib di prompt):**
`model=deepseek/deepseek-v4-flash` primer case_generation (satu-satunya yang
VALID di gate penuh pada raw capture), `timeoutMs=120000` (2 menit, batas valid
1000..120000, Vercel 300s), `maxRetries=0` (adapter no-retry → fallback).
`fallback.model=qwen/qwen3.5-flash:free`. `dialogueModel=hintModel=
mistralai/ministral-3b` (8.1s). `maxOutputTokens=4000` (raw 5861 char). Override
per promptType opsional — kosong → `text.model`. minimax*: coret (HTTP 200
content kosong semua varian highspeed).

Tanpa key di env untuk provider terpilih → `AUTHENTICATION` jelas
(tanpa fallback diam-diam).

## 10. Security

Tidak pernah terekspos: `XKIRO_API_KEY`, header Authorization, prompt penuh,
respons penuh, Case Bible kanonik. Log hanya `ai_generation_usage`
(provider/model/operation/token/latency/attempt/status).

## 11. Switch Gemini ↔ xKiro (tanpa redeploy)

**Gemini → xKiro:**

1. Set `XKIRO_API_KEY` di server env (Vercel/env) — satu-satunya perubahan env.
2. (Opsional) verifikasi key + pilih model: `npx tsx tests/smoke-xkiro-live.ts`
   (atau `XKIRO_SMOKE_MODEL=<id>` bila `/v1/models` tak tersedia).
3. Firestore `ai_runtime_config/production`: `text.provider = "xkiro"`,
   `text.model = "<model-id>"`; pastikan `text.enabled` + `caseGeneration.enabled`.
4. ≤45 dtk: request berikut memakai xKiro (cek log `ai_generation_usage`
   → `provider: "xkiro"`).

**xKiro → Gemini (rollback):** kembalikan `text.provider = "gemini"` +
`text.model` lama di Firestore. Tanpa redeploy. Darurat total:
`text.enabled = false` → deterministic mode.

## 12. Tests

- `tests/unit/ai-xkiro-adapter.test.ts` — 26 tests fake-fetch (24 wajib +
  2 helper parse): 200, URL, auth, model, structured pass-through, usage,
  missing content, invalid JSON (pass-through domain), 400/401/403/404/429/
  500/502, 503 retry bounded, timeout, max_tokens cap, router-xkiro,
  router-gemini-compat, invalid provider, no-leak, no-retry-429,
  no-extra-generation-fallback.
- `tests/smoke-xkiro-live.ts` — live opsional (tidak jalan di CI):
  butuh `XKIRO_API_KEY`; `/v1/models` (filter free) → `/v1/usage` (opsional) →
  TEPAT SATU text request; tanpa prompt/response penuh; tanpa retry kecuali
  `XKIRO_SMOKE_MAX_RETRIES` diset.
