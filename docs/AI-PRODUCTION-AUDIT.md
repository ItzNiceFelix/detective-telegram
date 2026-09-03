# AI Production Connectivity Audit — Detective Telegram

**Status**: AUDIT (no code change)
**Unit**: `src/ai/`, `src/infrastructure/adapters/ai/`, `src/kasus/generasi-kasus.ts`, `src/domain/services/renderer-naratif.ts`, composition root, `/api/*`.
**Metode**: verifikasi wiring faktual (import graph, composition root, entrypoint, environment) — bukan klaim dari README/docs.
**Keputusan ringkas**: Seluruh AI capability **belum terhubung ke produksi**. Tidak ada provider rill, tidak ada wiring runtime, env AI tidak pernah dibaca. Gameplay **fully deterministic** dan dapat berjalan tanpa AI.

---

## 1. Capability matrix

| Capability | Interface | Implementasi rill | Fake/test | Wiring produksi | Status rill | Dibutuhkan beta? |
|---|---|---|---|---|---|---|
| **Text AI** | `PintuAi.generateText` (`src/ai/contracts.ts`) | ❌ TIDAK ADA | `FakeAiProvider` (test only) | ❌ komposisi tidak meng-wire AI | **Abstract-only** | Tidak wajib (26.15: narrow) |
| **Image AI** | `KontrakPenyediaGambar.generateImage` (`visual-pipeline.ts`) | ❌ TIDAK ADA | `PenyediaGambarPalsu` (test only) | ❌ | **Abstract-only** | Tidak (offline/admin) |
| **Case Generator** | `PintuAi` → `buatKandidatKasus` (`generasi-kasus.ts`) | ❌ TIDAK ADA | `FakeAiProvider` (test only) | ❌ admin `regenerateCase`→501 manual | **Library tervalidasi, tak ter-trigger** | Tidak untuk closed beta |
| **Runtime Narrative** | `PintuRendererNaratif.renderRespon` | `RendererNaratifDeterministik` (non-AI) | `RendererNaratifAi` (test only) | ✅ deterministik ter-wire | **Deterministik; AI belum** | Tidak wajib |
| **Detective Assistant** | `buatResponsAsistenDetektif` (`detektif-asisten.ts`) | ❌ (optional provider; tanpa provider → jawaban bounded) | `FakeAiProvider` | ❌ tidak ada command | **Function-only** | Tidak (opsional) |

## 2. Actual code path (faktual)

**Yang benar-benar dieksekusi di produksi (per-request):**
```
/join,/investigate,/interrogate,… → KomandoTelegramLayanan
  → LayananInterogasiKasus.prosesInterogasi / prosesKonfrontasi
      → interogasiTersangka(…, renderer, …)
          → renderer.renderRespon(node.semanticResponse)   // sync
      → renderer          = RendererNaratifDeterministik   // kembalikan semanticResponse.text ATAU-APA-ADANYA
  → kirimPesanTelegram
```
Composition root (`src/komposisi/komposisi-aplikasi.ts`): `rendererNaratif = new RendererNaratifDeterministik()`; **tidak ada** `PenyediaAi`, `RendererNaratifAi`, `GatewayAiAdapter`, `FakeAiProvider`. Tidak ada import `src/ai/*` di komposisi, `api/telegram.ts`, maupun `api/admin.ts`.

**Yang hanya dieksekusi di test (`tests/unit/ai-*.test.ts`):**
- `FakeAiProvider` di `ai-visual-narrative.test.ts`, `ai-case-generation.test.ts`;
- `RendererNaratifAi.renderResponAsync` (fallback ke deterministik);
- `hasilkanAsetGambar` + `PembuatPromptVisual` + `RepositoriAsetVisualMemori`;
- `buatKandidatKasus` + `validasiGerbangPublikasi` + `ujiKeterpecahanKasus`/`ujiKeunikanSolusi`.

**Gateway/factory:** `src/infrastructure/adapters/ai/gateway.ts` → `GatewayAiAdapter` = dekorator pass-through `{ generateText(r){ return adapter.generateText(r) } }`. **Tidak di-instantiate**; tidak ada factory yang membaca `AI_PROVIDER` untuk mengembalikan provider rill.

## 3. Environment variables

| Variabel | Dibaca kode? | Lokasi | Status |
|---|---|---|---|
| `AI_PROVIDER` | ❌ | `.env.example` §AI, docs/ENV-SETUP | documented only — **tidak pernah dibaca** |
| `AI_MODEL` | ❌ | `.env.example` | documented only |
| `OPENAI_API_KEY` | ❌ | `.env.example` | documented only |
| `ANTHROPIC_API_KEY` | ❌ | `.env.example` | documented only |
| `GOOGLE_GEMINI_API_KEY` | ❌ | `.env.example` | documented only |
| `AI_ENABLED` | ❌ | `src/infrastructure/config/environment.ts`, `src/konfigurasi/lingkungan.ts` (tipe unik `boolean|string`) | dead — tidak dikonsumsi |
| `aiEnabled` (config objek) | ❌ default `false` | `konfigurasi/aplikasi.ts`, `infrastructure/config/environment.ts` | dead — tidak dipakai komposisi/entrypoint |

Fakta: Tidak ada kode yang membaca key provider atau menyambung provider rill. Mendapatkan token saja tidak membuat AI aktif; tidak ada provider yang membaca token tersebut.

## 4. Provider status

- Real text provider: **TIDAK ADA** (tanpa SDK OpenAI/Anthropic/Gemini di `package.json`; tanpa HTTP client AI; tanpa `generateText` yang memanggil API eksternal).
- Real image provider: **TIDAK ADA**.
- Fake providers: `FakeAiProvider` (text, scripted responses, throws bila response habis), `PenyediaGambarPalsu` (image, scripted) — **test-only, in-memory**.
- Gateway: `GatewayAiAdapter` (pass-through) — didefinisikan, **belum dipakai**.
- Case generator provider path: `buatKandidatKasus` memanggil `penyedia.generateText` (generasi-kasus.ts:131); hanya diuji dengan `FakeAiProvider`.
## 5. Runtime status

- **Audit D — Runtime narrative:** Game Engine → `interogasiTersangka` menghasilkan `semanticResponse` (deterministik) → `renderer.renderRespon()` → `RendererNaratifDeterministik` mengembalikan `semanticResponse.text` verbatim → Telegram. **AI narrative TIDAK dapat berjalan di produção** karena `RendererNaratifAi` (satu-satunya yang memanggil provider) tidak ter-wire dan tidak ada provider rill. Runtime 100% deterministik; tidak pernah memanggil API AI.
- **Audit E — Detective assistant:** `buatResponsAsistenDetektif` **hanya function (library)**, read-only (membaca fakta yang boleh diketahui; `mode:"read_only"`; validasi menolak solusi tersembunyi), tetapi **tidak ada command Telegram yang memanggilnya** (`/help`/`bantuan` yang ada hanyalah bantuan argumen, bukan assistant AI). Asisten = **abstraction/function only**.
- **Audit C — Case generator:** `buatKandidatKasus` → validators (`validasiStrukturKasus`, `validasiReferensiKasus`, `validasiLinimasa`, `validasiKausalitas`, `validasiBukti`, `validasiDialog`, `validasiGrafPembuktian`) → solver (`ujiKeterpecahanKasus`, `ujiKeunikanSolusi`) → publish gate (`validasiGerbangPublikasi`) → `publikasikanKandidatKasus`. **Seluruhnya ada & deterministik**, tetapi **tidak ada trigger runtime/admin** yang menjalankan pipeline dengan provider rill. Admin `regenerateCase` → `501 manual_operation`; admin `publishCase` memakai `publikasiVersiKasus` (domain versi) untuk snapshot yang sudah ada, BUKAN pipeline generasi.

## 6. Fallback status

- Narrative fallback (`RendererNaratifAi` → `RendererNaratifDeterministik` di `try/catch`): **ADA & teruji di unit test**, tetapi `RendererNaratifAi` tidak ter-wire → fallback ini tidak pernah aktif di produksi. Produksi memakai deterministik langsung (fallback ekivalen dengan jalur utama).
- Assistant fallback (tanpa provider → jawaban bounded deterministic): **ADA di function**, test-only, tak ter-trigger.
- Image pipeline: `ValidasiAsetVisual` menolak output mengandung data sensitif; `NEEDS_REVIEW` bila clue tak tervalidasi otomatis; **tanpa runtime image**, jadi fallback image tidak relevan di produksi (gambar tidak pernah di-generate runtime).
- Case generation failure → publish diblokir (gate). Tidak ada fallback "case otomatis" di runtime; case diperoleh dari published CaseVersion (Golden Case) yang sudah ada.

## 7. Cost profile

Karena tidak ada provider ter-wire, **biaya API AI = Rp 0 / 0 call di produksi saat ini**.

| Capability | Kapan dipanggil (rencana) | Pemicu | Cached? | Per replay? | Per gameplay action? | Fallback | Estimasi frekuensi (jika di-wire) |
|---|---|---|---|---|---|---|---|
| Case generation | Offline/admin build | Operator (admin `regenerateCase`) | Tidak (tiap run baru) | Tidak | Tidak | Gate memblokir bila gagal | Sangat jarang (per rilis kasus) |
| Image generation | Offline/admin build | Operator (admin), per plan/scene | **Ya** (key `caseId:sceneId:planId`, manifest; in-memory) | Tidak | Tidak | `NEEDS_REVIEW` / human QA | Satu kali per asset per kasus |
| Narrative (interogasi/konfrontasi) | Liveness per aksi | Player `/interrogate`, `/confront` | Tidak saat ini | Tidak | **Ya** (per aksi) | Deterministik | Bisa tinggi (per aksi gameplay) |
| Detective assistant | Liveness per pertanyaan | Player (command baru) | Tidak | Tidak | **Ya** (per pertanyaan) | Deterministik bounded | Per pertanyaan (rendah) |

Catatan cost: narrative adalah satu-satunya yang berpotensi high-frequency (memicu tiap aksi gameplay) → jika di-wire, penting bounded (`maxTokens:250`, fallback deterministik) + rate limit.

## 8. Security risks

- **Provider rill tidak ada** → tidak ada API-key exposure via network saat ini. Namun `.env.example` mendokumentasikan key; bila dev mengisi `.env.local`, key tak pernah dibaca (tidak bocor, tapi juga tidak berguna).
- **Config AI mati (`aiEnabled:false` tak dipakai)** → risiko miskognisi "AI siap" padahal hanya abstraction; dokumentasi kurang sinkron dengan kode.
- **Prompt injection** — guard sudah ada di library: `bersihkanPertanyaanAsisten` (strip `system prompt`, kontrol char 0-1F, cap 200); `validasiOutputNaratif` menolak `culprit/murderer/final accusation/unlock all`; `hasilkanAsetGambar` menolak `secret/token/password/system prompt`; assistant menolak `final solution/culprit/you know`. Hanya berlaku bila di-wire.
- **Authority boundary**: tidak ada kode AI yang menulis canonical truth; seluruh layer AI hanya renderer/generator (sesuai docs/20). Aman — tetapi karena tak ada provider, ini tidak terverifikasi di produksi.
- **Gateway pass-through tanpa rete**: bila provider rill ditambahkan tanpa rate/cost guard, narrative per-aksi bisa membengkak biaya.
## 9. Beta blockers

Tidak ada **gameplay** blocker dari sisi AI untuk closed beta, karena seluruh game deterministik dan dapat dimainkan penuh tanpa provider (Golden Case + published CaseVersion). Kondisi yang menahan "AI siap":

- **P0/P1 (AI-capability, bukan gameplay):** tidak ada provider rill; tidak ada wiring komposisi; tidak ada trigger case-generation; notifikasi assistant tidak ada. Jika spec open-beta membutuhkan AI narrative/assistant (docs/25 gate #6–#7: AI outage & image-failure fallback test), itu **belum terpenuhi**.
- **Test coverage yang ada**: `ai-case-generation`, `ai-visual-narrative` menguji library dengan `FakeAiProvider` — **bukan** integrasi produksi. `RendererNaratifAi` fallback diuji unit, tapi tidak pernah ter-wire.
- Untuk **closed beta** (docs/26.15, docs/09): AI dianggap **optional & boleh disabled** — keputusan "AI tidak dibutuhkan/unavailable → deterministik" sudah benar secara arsitektur, hanya belum diaktifkan.

## 10. Recommended minimal wiring plan (TANPA kode; hanya rencana)

1. **Beri provider rill** implementasi `PintuAi.generateText` (mis. OpenAI) — TIDAK menambah abstraction baru; cukup class provider + `fetch`.
2. **Factory baca `AI_PROVIDER`**: kembalikan provider rill bila key tersedia, `FakeAiProvider` bila tidak; default `fake` (sesuai docs/ENV-SETUP).
3. **Composition root**: wire `GatewayAiAdapter(provider)` → `RendererNaratifAi(provider, deterministik)` sebagai `rendererNaratif`; jaga fallback deterministik tetap default. Gerbang `aiEnabled` (yang sekarang dead) dihubungkan; bila `aiEnabled=false` atau tanpa key → pakai `RendererNaratifDeterministik` (persis kondisi saat ini = aman).
4. **Assistant**: tambah command (mis. `/bantuan <q>`) yang memanggil `buatResponsAsistenDetektif(konteksTerbatas, provider)`; pastikan read-only dan context hanya fakta yang boleh diketahui.
5. **Case/Image**: biarkan **offline/admin only** (docs/26.15). Kalau wajib, buat trigger admin `regenerateCase` yang memanggil `buatKandidatKasus` + `validasiGerbangPublikasi` + `publikasikanKandidatKasus` + `simpanVersiKasus`, dan `hasilkanAsetGambar` dengan repositori aset **persisten** (bukan in-memory) untuk cache lintas-cold-start.
6. **Bounded cost**: semua call `maxTokens` kecil; narrative per-aksi dilindungi rate limit; image & case generation hanya via admin.

## FREE-TIER REQUIREMENT CHECK (current, tanpa perubahan)

- Vercel function = 1 grup `api/**/*.ts` (+ cron `/api/cron` harian), **≤ target 4**: ✅
- No background worker / no per-minute cron: ✅ (cron harian saja)
- No runtime image regeneration: ✅ (image tidak pernah di-generate runtime)
- Cached generated assets: ⚠️ hanya `RepositoriAsetVisualMemori` (in-memory, tak durable); belum ada storage persisten
- Bounded AI calls: ✅ (bukan pembatas hard, tapi tanpa provider → 0 call)
- Optional AI dimatikan bila provider tak tersedia: ✅ (secara implisit — tanpa provider, deterministik; `aiEnabled` belum dijadikan gerbang eksplisit)
- Biaya API: Rp 0 saat ini.

---

## Verdict

Fakta kode: tidak ada provider rill, tidak ada factory ber-`AI_PROVIDER`, komposisi tidak meng-wire AI, tidak ada trigger case-gen/assistant, proses produksi memakai renderer deterministik. Semua capability AI saat ini adalah **abstraction / library tervalidasi / fake-test-only**, dan tidak diperlukan untuk closed beta yang fully-deterministik.

```
TEXT_AI_PRODUCTION = NOT_CONNECTED
IMAGE_AI_PRODUCTION = NOT_CONNECTED
CASE_GENERATOR_PRODUCTION = NOT_CONNECTED
RUNTIME_NARRATIVE = NOT_CONNECTED
DETECTIVE_ASSISTANT = NOT_CONNECTED
```

(Catatan: `RUNTIME_NARRATIVE` **produksi deterministik** AKTIF dan game playable; yang "NOT_CONNECTED" adalah jalur **AI** narrative — `RendererNaratifAi` + provider tidak ter-wire.)