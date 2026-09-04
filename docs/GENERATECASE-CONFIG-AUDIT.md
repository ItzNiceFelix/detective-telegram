# Audit Konfigurasi `/generatecase` — Production

## Ringkasan Eksekusi `/generatecase`

1.  **Entry Point**: `api/telegram.ts` → `handlerInternal` → `komposisi.layananKomando.prosesUpdate(update)`.
2.  **Command Routing**: `src/application/services/komando-telegram.ts` → `prosesUpdate` → deteksi `command === "/generatecase"` → panggil `generateCaseAdmin`.
3.  **Guard Admin**: `pastikanAdminGrup` (cek status Telegram member: creator/administrator).
4.  **Service Call**: `this.konfigurasi.layananProduksiKasus.generateCase(seed)`.
5.  **Production Service**: `src/application/services/layanan-produksi-kasus.ts` → `LayananProduksiKasus.generateCase`.

## Guard Failure Point

Di `LayananProduksiKasus.generateCase` (line 60-67):

```typescript
async generateCase(seed: BenihKasus, opsi: OpsiGenerasiKasus = {}): Promise<KandidatKasus> {
  if (!this.cfg.konfigurasi.caseGenerationEnabled) {
    throw buatKesalahanProviderAi("DISABLED", "AI Case Generation dinonaktifkan.");
  }
  const penyedia = this.cfg.konfigurasi.penyediaTeks;
  if (!penyedia) {
    throw buatKesalahanProviderAi("PROVIDER_UNAVAILABLE", "Text/AI provider tidak tersedia untuk case generation.");
  }
  // ... lanjut ke AI call
}
```

Error `"AI Case Generation dinonaktifkan."` berarti `caseGenerationEnabled === false`.

## Sumber `caseGenerationEnabled`

Variabel ini berasal dari `KonfigurasiAi` yang dibangun di `src/komposisi/komposisi-aplikasi.ts` line 157:

```typescript
const konfigurasiAi = opsi.konfigurasiAi ?? bacaKonfigurasiAi(process.env);
```

Logika di `src/ai/konfigurasi.ts` line 36-50:

```typescript
export function bacaKonfigurasiAi(env: Record<string, string | undefined>): KonfigurasiAi {
  const providerRaw = (env.AI_PROVIDER ?? "none").toLowerCase();
  const provider: ProviderAiTerpilih = providerRaw === "gemini" ? "gemini" : providerRaw === "fake" ? "fake" : "none";

  const geminiApiKey = env.GEMINI_API_KEY ?? "";
  const apiKeyValid = geminiApiKey.trim().length > 0;

  // ...

  // Honesty: jika provider=gemini tetapi kunci tidak valid (textReady=false),
  // case generation tidak bisa berjalan → paksa false apa pun flag env.
  const caseGenerationEnabled = provider === "gemini" && apiKeyValid
    ? bacaBoolean(env.AI_CASE_GENERATION_ENABLED, true) // ENABLED beta (admin/offline)
    : false;
  
  // ...
}
```

## Root Cause Analysis

`caseGenerationEnabled` akan `true` HANYA jika:
1.  `AI_PROVIDER` diset ke `"gemini"` (case-insensitive).
2.  `GEMINI_API_KEY` ada dan tidak kosong (trim length > 0).
3.  `AI_CASE_GENERATION_ENABLED` tidak diset eksplisit ke `"false"` atau `"0"` (default `true`).

Jika salah satu kondisi di atas gagal, `caseGenerationEnabled` jadi `false`.

### Kemungkinan Penyebab di Production

1.  **`AI_PROVIDER` tidak diset atau bukan "gemini"**: Default `"none"`. Jika env var ini hilang di Vercel, provider jadi `"none"` → `caseGenerationEnabled = false`.
2.  **`GEMINI_API_KEY` hilang/kosong**: Jika env var ini tidak terpasang di Vercel, `apiKeyValid = false` → `caseGenerationEnabled = false`.
3.  **`AI_CASE_GENERATION_ENABLED` diset `false`**: Cek apakah ada env var ini dengan value `"false"` atau `"0"`.

## Wiring Provider Teks

Di `komposisi-aplikasi.ts` line 158-172:

```typescript
const penyediaTeks = opsi.penyediaTeks ?? (
  konfigurasiAi.textReady
    ? (() => {
        const opsiTeks = {
          apiKey: konfigurasiAi.geminiApiKey as string,
          model: konfigurasiAi.textModel,
          timeoutMs: konfigurasiAi.timeoutMs,
          maxRetries: konfigurasiAi.maxRetries,
          maxOutputTokens: konfigurasiAi.maxOutputTokens,
        };
        if (process.env.GEMINI_API_BASE) opsiTeks.apiBase = process.env.GEMINI_API_BASE;
        return new GeminiTextProvider(opsiTeks);
      })()
    : undefined
);
```

`konfigurasiAi.textReady` (line 85 di `konfigurasi.ts`):
```typescript
get textReady(): boolean { return provider === "gemini" && apiKeyValid && textModel.length > 0; }
```

Jadi `penyediaTeks` juga `undefined` jika `AI_PROVIDER !== "gemini"` atau `GEMINI_API_KEY` kosong.

## Pengaruh `TELEGRAM_BETA`

`TELEGRAM_BETA` (via `ASSET_STORAGE_PROVIDER=TELEGRAM_BETA`) **TIDAK** memengaruhi `caseGenerationEnabled` atau `penyediaTeks`. Ia hanya mengontrol `penyimpananGambar` (binary storage) dan workflow asset task. Tidak ada coupling antara Text Case Generator dan Image Storage strategy.

## Environment Variables Kunci

| Variabel | Fungsi | Value Expected |
|----------|--------|----------------|
| `AI_PROVIDER` | Pilih provider AI | `"gemini"` |
| `GEMINI_API_KEY` | API key untuk Gemini | Valid key (non-empty) |
| `AI_TEXT_MODEL` | Model teks Gemini | `"gemini-flash-latest"` (default) |
| `AI_CASE_GENERATION_ENABLED` | Flag enable/disable case gen | `"true"` atau tidak diset (default `true`) |

## Minimal Fix

**Opsi 1: Vercel Environment Change (Recommended)**
Pastikan environment variables berikut terpasang di Vercel Dashboard → Settings → Environment Variables:
-   `AI_PROVIDER = gemini`
-   `GEMINI_API_KEY = <valid_api_key>`
-   `AI_TEXT_MODEL = gemini-flash-latest` (opsional, sudah default)

Tidak perlu ubah source code. Deploy ulang setelah set env vars.

**Opsi 2: Source Code Change (Jika env var tidak bisa diset)**
Hardcode provider/key di composition root — **TIDAK DIREKOMENDASIKAN** karena membocorkan secret ke repo.

## Kesimpulan

`GENERATECASE_CONFIGURATION_ROOT_CAUSE = Missing or invalid AI_PROVIDER/GEMINI_API_KEY environment variables in production (Vercel). caseGenerationEnabled defaults to false when provider is not 'gemini' or API key is empty.`

Audit selesai. Tidak ada perubahan source code. Fix murni konfigurasi environment.
