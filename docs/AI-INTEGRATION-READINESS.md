# AI Integration Readiness Plan — Detective Telegram

**Status**: READINESS PLAN — **AI integration v1 DONE** (Gemini; admin/offline hanya). Lihat §0 untuk status implementasi terkini.
**Input**: `docs/AI-PRODUCTION-AUDIT.md`, `docs/20-ai-generation-validation-contract.md`, `docs/26-coding-baseline.md`, `docs/25-final-open-beta-spec.md`, kode `src/ai`, composition root, interrogation renderer, CaseVersion/generation pipeline, image pipeline.
**Prinsip**: patch minimal; TIDAK mengubah domain/gameplay architecture; TIDAK menambah dependency provider; kemampuan AI **optional** untuk closed beta (gameplay sudah fully-deterministik dan playable tanpa AI).

---

## 0. AI Integration v1 — Status Implementasi (supersedes "no code change")

Gemini terpasang sebagai AI provider ≥ v1, **admin/offline HANYA** — bukan runtime gameplay. Default produksi tetap deterministik.

**Implemented (src):**
- `src/ai/errors.ts` — kesalahan AI terstruktur `KategoriKesalahanAi` = `AUTHENTICATION` | `QUOTA_RATE_LIMIT` | `TIMEOUT` | `INVALID_RESPONSE` | `UNSAFE_RESPONSE` | `PROVIDER_UNAVAILABLE` | `DISABLED`; `layakRetry` hanya `TIMEOUT`/`PROVIDER_UNAVAILABLE`.
- `src/ai/konfigurasi.ts` — `bacaKonfigurasiAi(env)` membaca `AI_PROVIDER`, `AI_TEXT_MODEL`, `AI_IMAGE_MODEL`, `AI_CASE_GENERATION_ENABLED`, `AI_RUNTIME_NARRATIVE_ENABLED`, `AI_ASSISTANT_ENABLED`, `GEMINI_API_KEY`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_GENERATION_ATTEMPTS`; getter `textReady`/`imageReady`.
- `src/infrastructure/adapters/ai/gemini-net.ts` — `panggilGemini` (boundary jaringan: timeout `AbortSignal`, mapping HTTP → kategori), `klasifikasikanStatus`.
- `src/infrastructure/adapters/ai/gemini-text.ts` — `GeminiTextProvider` (mengimplementasi `PintuAi`; JSON mode untuk `case_generation`/`hint`).
- `src/infrastructure/adapters/ai/gemini-image.ts` — `GeminiImageProvider` (mengimplementasi `KontrakPenyediaGambar`; metadata/ref URI, BUKAN binary).
- `src/infrastructure/repositories/firestore/repositori-aset-visual.ts` — repositori aset visual durable (`visual_assets`, `visual_asset_manifests`), dedup `caseId:sceneId:planId`.
- `src/application/services/layanan-produksi-kasus.ts` — `generateCase` (seed → `buatKandidatKasus` → publish gate → simpan PUBLISHED immutable) & `generateImages` (dedup + manifest).
- Composition root wiring → `api/admin.ts` action `generateCase`, `generateImages`, `rejectCandidate` (no-op terdokumentasi); `regenerateCase` → 400 unsupported.

**Production default tetap deterministik (playable tanpa AI):**
- `AI_PROVIDER` default `none` → case generation disabled & provider pap tidak terbangun tanpa key (`GEMINI_API_KEY`).
- `AI_RUNTIME_NARRATIVE_ENABLED=false` → `RendererNaratifDeterministik`.
- `AI_ASSISTANT_ENABLED=false` → detective assistant tidak diimplementasikan.

**Gap terbuka (v1):**
- Binary image → **object storage masih placeholder** `asset://gemini/...`; Firestore hanya menyimpan metadata/manifest (VISUAL_02/03).
- Belum ada live Gemini API smoke test (test memakai mock fetch / fake provider).
- Provider/model/harga belum dikunci final — lihat `docs/AI-PROVIDER-DECISION.md`.

**Verifikasi:** `npx tsc --noEmit` bersih; `npm test` → **258 pass / 0 fail** (termasuk `ai-gemini-adapters`, `layanan-produksi-kasus`, `repositori-aset-visual-firestore`, `api-admin-ai`).
## 1. Case Generator (`src/kasus/generasi-kasus.ts`)

### Existing interface
- Input: `BenihKasus` (genre, setting, difficulty, counts, mechanics), `OpsiGenerasiKasus` (maxRetries, provider, model, …).
- Output: `KandidatKasus` (caseId, versionId, caseBibleRef, assetManifestRef, metadata, `CaseBible`, `MetadataGenerasiKasus`).
- Pintu AI: `PintuAi.generateText` (`src/ai/contracts.ts`).
- Validators (semua deterministik, sudah ada): `validasiStrukturKasus`, `validasiReferensiKasus`, `validasiLinimasa`, `validasiKausalitas`, `validasiBukti`, `validasiDialog`, `validasiGrafPembuktian`, `validasiTidakAdaSoftlock`, `validasiKeamananKasus`.
- Solver/keunikan: `ujiKeterpecahanKasus`, `ujiKeunikanSolusi`.
- Publish gate: `validasiGerbangPublikasi`, lalu `publikasikanKandidatKasus` → `buatVersiKasus` (immutable, `StatusVersiKasus.PUBLISHED`).

### Current call path
- Hanya dipanggil di **test** (`tests/unit/ai-case-generation.test.ts`) dengan `FakeAiProvider`.
- `buatKandidatKasus` → `buatKandidatKasusDenganPenyedia`: loop retry, `penyedia.generateText` (`maxTokens:2400`), `JSON.parse`, `normalisasiKandidatKasus`, `validasiGerbangPublikasi(validasiSemua:true)`.
- Runtime/admin: **tidak ada trigger**. `api/admin.ts` `regenerateCase` → `501 manual_operation`; `publishCase` dipakai untuk snapshot yang SUDAH ada (bukan pipeline generasi).

### Exact missing wiring
1. Provider teks rill yang mengimplementasi `PintuAi.generateText`.
2. Factory/`AI_PROVIDER` yang mengembalikan provider (rill bila key tersedia; `FakeAiProvider` bila tidak; default `fake`).
3. Trigger admin `regenerateCase` yang memanggil: seed → `buatKandidatKasus(seed, provider)` → `validasiGerbangPublikasi` → `publikasikanKandidatKasus` → `repositoriVersiKasus.simpanVersiKasus(versi)` (Firestore) → audit log. (Admin saat ini tidak memiliki method generasi; hanya publish snapshot existing.)

### Provider abstraction needed
`PenyediaKasus` tidak perlu abstraction baru — reuse `PintuAi`. Wrapping opsional `GatewayAiAdapter`. Game Engine / domain tidak tahu provider (per docs/18: `KandidatKasus` dibuat di luar domain runtime).

### Configuration / env needed
- `AI_PROVIDER` (`openai|anthropic|gemini|fake`), `AI_MODEL`, key (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_GEMINI_API_KEY`) — sudah ter-dokumentasi `.env.example`, **belum dibaca kode**.
- Wajib jadikan `aiEnabled` (kini dead default `false`) sebagai gerbang nyata di komposisi: bila `!aiEnabled` atau tanpa key → `regenerateCase` tetap `501/disabled`, jangan pakai provider.
- Validasi konfigurasi: gagal jelas (fail-fast) bila `AI_PROVIDER!==fake` tapi key kosong — tidak mengklaim siap.

### Where provider should be initialized
- **Composition root** (`src/komposisi/komposisi-aplikasi.ts`): satu instans provider dibangun dari env, dibungkus `GatewayAiAdapter`, **disuntikkan ke admin** (atau endpoint admin build), BUKAN ke gameplay service.

### Where provider must NOT be called
- Di dalam **Firestore transaction** (docs/17 PERSIST-04/07 — no AI/external call di dalam transaction).
- Di jalur `/api/telegram.ts` / gameplay request.
- Setiap aksi gameplay. Case generation = **offline/admin only** (docs/26.15, VISUAL_OFFLINE).

### Fallback behavior
- Bila generasi gagal validasi → `throw KesalahanValidasi` → publish **diblokir** (gate). Tidak ada silent-repair (AI_CASE_02).
- Bila provider mati/disabled → tidak ada kandidat baru; case diperoleh dari published CaseVersion yang sudah tersedia (Golden Case). Tidak pernah memblokir gameplay.

### Retry policy
- **Provider-level** (opsional, di adapter): retry transient (mis. 2, backoff) untuk 5xx/timeout.
- **Generation-level** (sudah ada di kode): `maxRetries` default 2 → total ≤ 3 panggilan. JANGAN naikkan tanpa batas.
- Idempotensi: setiap run menghasilkan `caseId/versionId` unik (bukan revisited); publish sekali; simpan-version idempoten (set).

### Caching requirements
- Kandidat TIDAK di-cache (per-generate baru). Yang di-cache: **asset manifest** untuk visual (lihat §2). Persistence hanya version PUBLISHED yang tervalidasi.

### Rate-limit requirements
- Generation admin/offline → frekuensi rendah. Batasi via **rate limit admin existing** (`RATE_LIMIT_MAX_ACTIONS`) + pembatas "1 generation aktif per admin" (tanpa queue/worker).

### Failure behavior
- Blokir publish; audit log; respons admin jelas (bukan 202 boneka). Gameplay tidak terpengaruh.

### Test strategy
- Unit sudah ada (`ai-case-generation.test.ts`). Tambah **integration**: admin `regenerateCase` → tersimpan PUBLISHED hanya bila `validasiGerbangPublikasi` lolos; malformed JSON → bounded retry (sudah ada); dua trigger concurrent → dua caseId unik; kunci API kosong → disabled (bukan crash).
---

## 2. Image Generator (`src/ai/visual-pipeline.ts`)

### Existing interface
- `KontrakPenyediaGambar.generateImage(request): Promise<ResponAi>` (output JSON: assetId/uri/format/sizeBytes/requiredClues/forbiddenClues/verifyNotes).
- `VisualPlan`, `AsetVisual`, `ManifestAsetVisual`, `KontrakRepositoriAsetVisual`, `PembuatPromptVisual`, `ValidasiAsetVisual`, `hasilkanAsetGambar`, `buatManifestAsetVisual`, `simpanReferensiAset`.
- `PenyediaGambarPalsu` (fake in-memory) — test only.

### Current call path
- Hanya di test (`tests/unit/ai-visual-narrative.test.ts`).
- `hasilkanAsetGambar(caseId, plan, penyedia, repositori, providerName)`: lookup cache (`repositori.ambil(key)`); ada → return; tidak → `PembuatPromptVisual.bangunPromptVisual` → `penyedia.generateImage` → moderasi (`/secret|token|password|system prompt/`) → `JSON.parse` → `ValidasiAsetVisual.validasiAset` → `repositori.simpan`.
- Dedup key stabil: `repositori.ambilKunci(plan, caseId) = caseId:scene:planId` (satu aset per plan/scene di-reuse).
- `RepositoriAsetVisualMemori` = **in-memory** — hilang pada cold start/restart, tidak durable.

### Exact missing wiring
1. Provider gambar rill mengimplementasi `KontrakPenyediaGambar` (atau `PintuAi.generateImage`).
2. **Repositori aset persisten** Firestore-backed (bukan memori) agar cache lintas cold-start & manifest per case durable (VISUAL_02/03/04).
3. Asset storage (object URL/file id) — bukan binary di Firestore (VISUAL_02); saat ini hanya `uri` string.
4. Trigger admin/offline build: per scene plan → `hasilkanAsetGambar` → kumpulkan → `buatManifestAsetVisual` → `simpanReferensiAset` → ref manifest disimpan di Case version (`assetManifestRef`).

### Provider abstraction needed
`KontrakPenyediaGambar` sudah memisahkan abstraction dari implementasi (docs/05 rule 3). Provider gambar terpisah dari text provider. Game Engine tidak mengenal penyedia gambar (visual = asset, bukan gameplay truth).

### Configuration / env needed
- Variabel untuk provider gambar (image provider/API) + storage bucket + gerbang `AI_ENABLED`/`aiEnabled`. Perlu DECISION (lihat akhir) — tidak ada var yang dibaca kode saat ini.

### Where provider should be initialized
- Composition root / **offline admin batch** (build). Satu penyedia gambar + repositori aset Firestore + storage objek. Tidak pernah di jalur runtime.

### Where provider must NOT be called
- **Runtime request path** (per-player). **No runtime image regeneration** (docs/26.15, free-tier, VISUAL_01). Di dalam Firestore transaction — tidak boleh.

### Fallback behavior
- QA gagal → `NEEDS_REVIEW`/ditolak (20.12); tanpa aset tervalidasi → manifest tidak di-finalisasi → publish kasus diblokir (20.3). Gameplay playable tanpa gambar (placeholder) bila beta mengizinkan.

### Retry policy
- Retry transient terbatas di adapter (mis. 2, backoff) untuk 5xx/timeout.
- Cache dedup mencegah regenerasi; `NEEDS_REVIEW` → human QA, bukan auto-retry.

### Caching requirements
- **WAJIB durable** (Firestore-backed repo). Key `caseId:sceneId:planId` (sudah). Manifest per case (sudah). Reuse lintas replay & cold start.

### Rate-limit requirements
- Admin/offline only, low frequency, bounded (per plan/scene); JANGAN di jalur per-player.

### Failure behavior
- Blokir manifest final; audit; tanpa gangguan gameplay; tanpa biaya berulang (cache).

### Test strategy
- Unit sudah ada. Tambah integration: repositori Firestore cache dedup (2 call → 1 aset); manifest persist; QA menolak output invalid; admin/offline trigger.
---

## 3. Runtime Narrative Renderer (`src/domain/services/renderer-naratif.ts`, `src/domain/services/interogasi.ts`)

### Existing interface
- **`PintuRendererNaratif.renderRespon(semanticResponse): string` — SYNCHRONOUS**.
- `RendererNaratifDeterministik.renderRespon` → `semanticResponse.text` apa adanya (runtime saat ini).
- `RendererNaratifAi` → **`renderResponAsync` (async)** + fallback deterministik + `validasiOutputNaratif` (≤500 char; tolak culprit/solution leakage).
- Call path: `KomandoTelegramLayanan` → `LayananInterogasiKasus.prosesInterogasi` → `interogasiTersangka` → `renderer.renderRespon(node.semanticResponse)` (sync) → `HasilInterogasi.responseText` → Telegram.

### Exact missing wiring
1. Provider teks rill (`PintuAi`).
2. **Async boundary untuk AI**: interface runtime sync; `RendererNaratifAi` async. Opsi minimal (tanpa ubah domain semantics):
   - **Opsi A (rekomendasi beta)** — runtime **tetap deterministik**; AI narrative dipakai **offline/admin** untuk memperkaya `semanticResponse.text` pada build asset kasus. Zero runtime AI.
   - **Opsi B (opsional live)** — tambah jalur async di **lapisan aplikasi** (`LayananInterogasiKasus`): panggil provider SETELAH commit (PERSIST-07), fallback deterministik, gerbang `aiEnabled`+provider. Domain `interogasiTersangka` TIDAK diubah.
3. Wiring composition root: `renderer = aiEnabled & provider-ready ? new RendererNaratifAi(provider, deterministik) : new RendererNaratifDeterministik()`.

### Provider abstraction needed
`PintuRendererNaratif` sudah abstraksi; Game Engine hanya bergantung interface (engine tak tahu provider, docs/18). Reuse `PintuAi`.

### Configuration / env needed
`AI_ENABLED`/`aiEnabled`, `AI_PROVIDER`, `AI_MODEL`, key. `maxTokens:250` sudah di `RendererNaratifAi`.

### Where provider should be initialized
Composition root: satu instans renderer (AI atau deterministik) di-inject ke `LayananInterogasiKasus`, sekali per warm invocation.

### Where provider must NOT be called
- Di dalam **Firestore transaction** (render/prepend sebelum atau post-commit, PERSIST-07; call provider pastikan post-commit).
- Saat Telegram send / di tengah commit.
- Saat `aiEnabled=false` / provider tak tersedia → fallback deterministik tanpa memanggil provider.

### Fallback behavior
`RendererNaratifAi.renderResponAsync` sudah `try/catch` → `fallback.renderRespon` (deterministik). Gameplay selalu bisa diselesaikan (docs/07). `validasiOutputNaratif` cegah leakage & batas panjang.

### Retry policy
- **TIDAK retry per gameplay action** (latency & cost). Satu percobaan + fallback. Retry hanya bila Opsi A (build offline).

### Caching requirements
- Cache transcript per `nodeId + sessionId` untuk menekan biaya bila live narrative (satu narasi per node/sesi, bukan per permintaan). Saat ini belum ada cache — tambah bila Opsi B.

### Rate-limit requirements
- Narrative = satu-satunya capability **high-frequency** (per aksi `/interrogate`). Wajib: bound token, rate limit update (existing), cache per-node, fallback deterministik. Tanpa ini biaya API tak terkendali.

### Failure behavior
Provider error / timeout / output melewati validasi → fallback deterministik; aksi tetap sukses; tidak ada duplicate reward (state diubah engine, bukan AI). Log + metric (docs/26.18).

### Test strategy
- Unit sudah ada (fallback `RendererNaratifAi`). Tambah integration: enabled flow mengembalikan render AI; provider error → deterministik & aksi sukses; token bound; forced outage → case tetap SOLVED.

---

## 4. Detective Assistant (OPTIONAL)

- Interface: `buatResponsAsistenDetektif(konteks, provider?)` — **read-only**, sanitasi (`bersihkanPertanyaanAsisten`), bound 400 char, tolak solution leakage; tanpa provider → jawaban deterministik bounded (built-in).
- Missing wiring: command Telegram (mis. `/bantuan <q>`), konteks dari state yang boleh diketahui, gerbang `aiEnabled`+provider.
- Tidak diperlukan untuk beta (docs/26.15, 25). Bila diaktifkan: read-only wajib, bounded, fallback deterministik, rate limit per-user/group.
---

## 5. COST MODEL

| Capability | Trigger | Expected calls | Cached? | Runtime? | Failure fallback | Beta required? |
|---|---|---|---|---|---|---|
| **Case Generator** | Admin/offline only (`regenerateCase` build) | ≤ 1–3 per candidate (maxRetries=2); jarang (per rilis kasus) | Tidak (kandidat baru per run) | ❌ offline only | Gate blokir publish; case existing tetap dipakai | Tidak wajib |
| **Image Generator** | Admin/offline only (per scene plan build) | 1 per plan/scene (reuse via cache); jarang | **Ya** (key `caseId:scene:planId`, harus durable) | ❌ offline only | `NEEDS_REVIEW`/human QA; publish diblokir bila tak valid | Tidak wajib |
| **Runtime Narrative** | Gameplay runtime (`/interrogate`, `/confront`) | per aksi (potensial high-frequency) | Tidak saat ini (harus tambah cache per node/sesi bila live) | ⚠️ opsional live (Opsi B), atau deterministik (Opsi A) | Deterministik (game tetap playable) | Opsional |
| **Detective Assistant** | Optional, per pertanyaan player (`/bantuan`) | per pertanyaan (rendah) | Tidak | ⚠️ opsional | Deterministik bounded (built-in) | Tidak wajib |

Catatan: bervariasi berdasarkan Opsi A (runtime deterministik, AI di build) vs Opsi B (AI live narrative). Rekomendasi beta = **Opsi A** → zero runtime AI cost.

---

## 6. PROVIDER ABSTRACTION

```
Application  (LayananInterogasiKasus / admin build / assistant)
    ↓  (bounded & optional)
AI Gateway   (GatewayAiAdapter / factory by AI_PROVIDER)
    ↓
Provider Adapter  (implementasi PintuAi / KontrakPenyediaGambar — OPENAI|ANTHROPIC|GEMINI|FAKE)
```

- **Game Engine / domain tidak boleh tahu provider**: `interogasiTersangka` hanya bergantung `PintuRendererNaratif`; `buatKandidatKasus` hanya bergantung `PintuAi`; `hasilkanAsetGambar` hanya bergantung `KontrakPenyediaGambar`. Replace provider = ganti adapter, tanpa menyentuh domain.
- `GatewayAiAdapter` sudah ada (pass-through) — bisa jadi titik rate-limit/cost-guard/meter di masa depan, tapi saat ini hanya dekorator.
- Factory ideal (nanti): `AI_PROVIDER` → provider; default `fake`; fail-fast bila non-fake tanpa key.

---

## 7. FREE-TIER COMPLIANCE (minimal, fakta)

TIDAK akan digunakan: Redis, background worker, queue, polling, persistent process, runtime image regeneration.
- Vercel function = 1 kelompok (`api/**/*.ts`), ≤ target 4; cron harian.
- Case & image generation = **admin/offline only** (build step), bukan runtime.
- Runtime narrative (bila aktif) = bounded maks token + cache + fallback + rate limit, atau tetap deterministik.
- JANGAN mengasumsikan AI API gratis — setiap capability punya biaya; kendalikan via trigger admin, cache, dan bound.

---

## 8. AI_PROVIDER_DECISION_REQUIRED = YES

Provider belum dipilih (sesuai instruksi: jangan memilih berdasarkan asumsi, jangan klaim gratis). Sebelum provider dipasang, harus diketahui:

1. **Provider teks** (Case Generator & opsi narrative): nama provider, model, harga per 1K token (input+output), latency, rate limits, SLA/status endpooint, key manajemen (Vercel env).
2. **Provider gambar** (Image Generator): provider/model, harga per image, rate limit, dukungan format (png/jpeg/webp), dukungan output — perlu JSON metadata asset (beberapa provider hanya return binary/URL), kebijakan storage/download URL.
3. **Storage objek**: bucket (provider apa, biaya egress/bandwidth Vercel→bucket), apakah URL publik atau perlu pre-signed.
4. **Gerbang fitur**: apakah `AI_ENABLED`/`aiEnabled` sengaja jadi gate; nilai default untuk closed beta (fake/off).
5. **Biaya naratif live (jika Opsi B)**: estimasi jumlah aksi per sesi × token → budget bulanan; apakah layak di free-tier.
6. **Retry/limit provider**: kode status apa yang bisa retry, backoff, timeout timeoutMs, max tokens.
7. **Audit/biaya**: apakah perlu meter guna (docs/26.18 metrics AI calls/failures) sebelum aktif.
8. **Test provider**: apakah tersedia sandbox/fake yang mereplikasi format response (untuk tetap hijau tanpa biaya).

> Keputusan: pekerjaan integrasi **belum dimulai** sampai daftar di atas dijawab; closed beta tetap deterministik & playable tanpa AI.

---

**STOP — dokumen readiness; tidak ada kode/perubahan.