# AI LIVE + STORAGE SMOKE — Result

Status: **EXECUTED** (real credentials, storage = TELEGRAM_BETA)
Final verdict: **`LIVE_AI_SMOKE = FAIL`**

Real provider + storage tidak SEMUA berhasil pada percobaan ini:

- Real Gemini **TEXT**  : **PASS** (HTTP 200, model `gemini-flash-latest`)
- Real Gemini **IMAGE** : **FAIL** (HTTP 429 — quota / rate / plan untuk `gemini-3.1-flash-image`)
- TELEGRAM_BETA upload / read-back / Firestore manifest / dedup : **NOT EXECUTED** (terblokir oleh image gagal)

Tidak ada secret yang dicetak atau dipersist; `.env` tidak diubah, tidak di-commit.

---

## 1. Credential gate (status saja, tanpa nilai)

| Variabel | Status |
| -------- | ------ |
| `GEMINI_API_KEY` | ok |
| `AI_PROVIDER=gemini` | ok |
| `AI_TEXT_MODEL` | ok (`gemini-flash-latest`) |
| `AI_IMAGE_MODEL` | ok (`gemini-3.1-flash-image`) |
| `TELEGRAM_BOT_TOKEN` | ok |
| `TELEGRAM_ASSET_VAULT_CHAT_ID` | ok |
| `ASSET_STORAGE_PROVIDER=TELEGRAM_BETA` | ok |
| `FIREBASE_PROJECT_ID` | ok |
| `FIREBASE_CLIENT_EMAIL` | ok |
| `FIREBASE_PRIVATE_KEY` | ok |

Semua lulus melalui harness `tests/smoke-ai-live.ts` (memuat `.env`, tanpa mencetak nilai secret).

---

## 2. Test matrix (live)

| Langkah | Result | Evidence |
| ------- | ------ | -------- |
| 1. Credential gate | **PASS** | semua variabel ok |
| 2. Real Gemini TEXT | **PASS** | HTTP 200, `gemini-flash-latest`, latency ≈ 14290 ms, attempts=1 (retry 0), output 30 char |
| 3. Real Gemini IMAGE | **FAIL** | HTTP 429 untuk `gemini-3.1-flash-image` (QUOTA / rate / plan). Adapter memetakan 429 → `QUOTA_RATE_LIMIT` dan tidak retry (desain). |
| 4. Upload TELEGRAM_BETA | **NOT EXECUTED** | terblokir oleh image 429 |
| 5. Read-back | **NOT EXECUTED** | — |
| 6. Firestore manifest | **NOT EXECUTED** | — |
| 7. Dedup | **NOT EXECUTED** | — |
| 8–14. generateCase / publish / sesi / replay | **NOT EXECUTED** | butuh text generation kedua di luar batas satu-text smoke awal; plus terblokir image |

**AI call nyata** pada smoke ini: `text = 1`, `image = 1` (image gagal HTTP 429). Tidak ada retry (429 bukan kategori retriable pada adapter).

---

## 3. Root cause (dilaporkan, TIDAK diperbaiki — bukan bug source)

Image generation Gemini menolak dengan **HTTP 429** untuk model **`gemini-3.1-flash-image`** pada kredensial/plan saat ini. Ini kondisi **QUOTA / rate-limit / plan**, bukan cacat kode: text (`gemini-flash-latest`) berhasil **HTTP 200**. Konsisten dengan catatan kebutuhan *upgrade plan*. **Tidak ada perubahan source** sampai plan/mode diklarifikasi.

---

## 4. Required report fields

| Field | Value |
| ----- | ----- |
| Provider | `gemini` (real) |
| Model text | `gemini-flash-latest` (live HTTP 200) |
| Model image | `gemini-3.1-flash-image` (HTTP 429) |
| Latency text | ≈ 14290 ms |
| Latency image | n/a (429) |
| Retry count (text) | 0 (attempts = 1) |
| Asset size | n/a (image gagal) |
| Storage reference type | `TELEGRAM_BETA` / `telegramFileId` / `BEST_EFFORT` (belum pernah di-upload) |
| Firestore manifest | belum diverifikasi (image gagal) |
| Provider invocation count | text = 1, image = 1 |

---

## 5. Final verdict

```text
LIVE_AI_SMOKE = FAIL
```

Real provider belum sepenuhnya terbukti: image gagal HTTP 429; storage dan publish tidak dijalankan.

Ulangi setelah salah satu:
1. plan/kuota image memenuhi, **ATAU**
2. `AI_IMAGE_MODEL` diset ke model yang tersedia di plan saat ini.

Lalu jalankan ulang:

```bash
npx tsx tests/smoke-ai-live.ts
```

---

## Catatan: Telegram Asset Vault Live Smoke

Untuk smoke **human-in-the-loop** (asset via Telegram vault), lihat
**`docs/TELEGRAM-ASSET-LIVE-SMOKE.md`**. Status terpisah dan jujur:
**`LIVE_TELEGRAM_ASSET_SMOKE = FAIL`** (belum dieksekusi — precheck
`TELEGRAM_SECRET` kurang + langkah manusia/webhook tidak dapat dijalankan dari shell).