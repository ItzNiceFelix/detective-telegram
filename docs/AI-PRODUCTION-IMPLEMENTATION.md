# AI Production Implementation — Token Usage Telemetry

**Status**: IMPLEMENTED (telemetri; provider/model tidak berubah)
**Scope**: `/generatecase` → operation `CASE_GENERATION`
**Aturan `/generatecase`**: prompt, generation logic, validator, solver, publish gate, dan retry policy TIDAK berubah.

Tujuan: mengukur token usage aktual production Gemini (diagnosa 429) tanpa menyentuh behavior game.

---

## 1. Bagaimana token usage dihitung

Prioritas (tidak pernah duplicate AI generation untuk pengukuran):

1. **Provider usage metadata** — `usageMetadata` respons Gemini `generateContent`
   diparse di `src/infrastructure/adapters/ai/gemini-net.ts`
   (`uraiUsageMetadata()`):
   - `promptTokenCount` → `tokenInput`
   - `candidatesTokenCount` → `tokenOutput`
   - `totalTokenCount` → `tokenTotal`
   - `thoughtsTokenCount` → `tokenThinking`
2. **`countTokens` preflight** (opsional, default OFF) — bila respons generate
   TIDAK menyediakan metadata, endpoint `countTokens` dipanggil SEKALI sebelum
   generate sebagai estimasi `tokenInput`. Endpoint terpisah & murah; BUKAN
   duplicate generation. Aktifkan via env `AI_COUNT_TOKENS_ENABLED=true`.
3. **`null`** — bila keduanya unavailable (field log = `null`).

Preflight gagal-aman: kegagalan `countTokens` (network/HTTP/exception)
menangkap dan mengembalikan estimasi kosong; generate induk TIDAK pernah
gagal karenanya.

`ResponAi.usage` (`src/ai/contracts.ts`, interface `PenggunaanAi`) membawa
hanya field generik (`tokenInput`, `tokenOutput`, `tokenTotal`,
`tokenThinking`) — field provider-specific TIDAK bocor ke domain. Domain/Game
Engine mengabaikannya (tidak dibaca `generasi-kasus.ts`).

## 2. Telemetry fields

Setiap panggilan `PintuAi.generateText()` (adapter `GeminiTextProvider`)
mencetak SATU log terstruktur via `LoggerStruktur`:

```
ai_generation_usage
```

Fields (`src/infrastructure/adapters/ai/telemetri-ai.ts`):

| Field | Sumber | Keterangan |
|---|---|---|
| `provider` | wiring composition | `"gemini"` |
| `model` | wiring composition | model teks aktif |
| `operation` | `petungOperasiAi(promptType)` | `case_generation` → `CASE_GENERATION`; juga `DIALOGUE`, `HINT`, `VISUAL_PROMPT` |
| `tokenInput` | usage metadata / preflight | `null` bila unavailable |
| `tokenOutput` | usage metadata | `null` bila unavailable |
| `tokenTotal` | usage metadata | `null` bila unavailable |
| `tokenThinking` | usage metadata, bila ada | field absen bila provider tidak melapor |
| `durationMs` | `Date.now()` di adapter | latensi generate (ms) |
| `attempt` | counter retry adapter | percobaan yang menghasilkan record ini (1-based) |
| `status` | HTTP response | mis. `200`, `401`, `429`; `null` bila network-level |

Log juga dicetak untuk pemanggilan yang GAGAL (mis. 429) — ini inti diagnosa
quota: kegagalan rate-limit tetap terekam dengan `attempt` + `status`.

**Tidak pernah dicatat**: prompt, Case Bible, full AI response, API key,
data pribadi pengguna. Serialisasi log hanya berisi angka & label di atas.

Contoh (dari test, tanpa prompt/secret):

```json
{
  "timestamp": "2026-09-04T07:59:00.000Z",
  "level": "info",
  "message": "ai_generation_usage",
  "context": {
    "provider": "gemini",
    "model": "gemini-flash-latest",
    "operation": "CASE_GENERATION",
    "tokenInput": 1284,
    "tokenOutput": 2411,
    "tokenTotal": 3695,
    "tokenThinking": 140,
    "durationMs": 8421,
    "attempt": 1,
    "status": 200
  }
}
```

### Wiring

- Composition root (`src/komposisi/komposisi-aplikasi.ts`) membuat penerima
  via `buatPenerimaTelemetriAi(logger, provider, model)` dan menginjeksi ke
  `GeminiTextProvider` (`opsi.telemetri`).
- Tanpa logger/penerima → telemetri no-op; generation TIDAK terpengaruh.
- Path `/generatecase` (`komando-telegram.ts` → `layanan-produksi-kasus.ts`
  → `buatKandidatKasus` → `generateText`) otomatis terekam sebagai
  `CASE_GENERATION` karena `promptType: "case_generation"`. TIDAK ada
  perubahan pada prompt, retry policy, validator, solver, maupun publish gate.

## 3. Provider usage limitations (Gemini)

- `usageMetadata` hanya tersedia pada respons `generateContent` yang SUKSES
  (HTTP 2xx + kandidat). Respons error (401/429/5xx), safety-block, dan
  kandidat kosong TIDAK membawa usage → token fields = `null`.
- `thoughtsTokenCount` hanya ada pada model yang memakai thinking
  (reasoning). Model non-thinking → field absen.
- `countTokens` adalah ESTIMASI tokenisasi server untuk request; BUKAN nilai
  billing-final dan TIDAK mencakup output. Dipakai hanya untuk `tokenInput`
  bila metadata absen.
- Ukuran estimasi tidak menjamin kecocokan 1:1 dengan kuota provider;
  gunakan untuk tren/diagnosa 429, bukan akuntansi presisi.

## 4. Tests

`tests/unit/ai-telemetri-token.test.ts` (tanpa real Gemini API):

- usage metadata ter-parse benar (input/output/total/thinking)
- metadata hilang ditangani aman (usage absen, tanpa throw)
- `countTokens` gagal → generation tetap sukses
- `countTokens` sukses → `tokenInput` terisi sebagai fallback
- log `ai_generation_usage` berisi operation/latency/attempt/status,
  tanpa prompt/secret; tercatat juga pada 429
- telemetry tidak memutasi domain (kandidat identik dengan/tanpa usage;
  tidak ada field token di candidate/CaseVersion)
