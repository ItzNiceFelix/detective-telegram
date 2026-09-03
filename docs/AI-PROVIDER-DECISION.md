# AI Provider Decision Matrix — Detective Telegram (September 2026)

**Status**: DECISION MATRIX (no code, no SDK install, no env change)
**Data source**: dokumentasi resmi provider (di-fetch 2026-09); harga DeepSeek & daftar model Gemini **dikutip langsung**. Angka Gemini yang belum sempat ter-extract dari halaman pricing ditandai `[VERIFY]` — TIDAK dibuat-buat.
**Konteks resource**: Vercel free, Firebase free, tanpa Redis/worker/queue, AI offline/admin, runtime AI optional, image **harus cached & durable**.

Prinsip: **jangan mengklaim gratis**, **jangan pilih provider dari asumsi**, **game engine tidak tahu provider** (`Application → AI Gateway → Provider Adapter`).

---

## 1. Provider yang dievaluasi

### 1.1 Google Gemini API
(resmi: `ai.google.dev`, Gemini Developer API)
- **Ketersediaan API**: aktif; model `Gemini 3.x` (Flash-Lite, 3.1 Flash-Lite, 3.5/3.6/3.7/3.8 Flash, 3.1 Pro Preview) + model gambar **Nano Banana 2 / Nano Banana 2 Lite / Nano Banana Pro** (per `docs/models`, last updated 2026-09-02).
- **Free tier**: ADA — "Start building free of charge with generous limits", "Free input & output tokens", akses terbatas model tertentu, **konten dipakai untuk memperbaiki produk** (ops-out hanya di paid tier). (resmi: pricing page)
- **Bayar**: "prepaid then pay-as-you-go"; paid tier memberi rate-limit lebih tinggi, **Context caching**, **Batch API (50% cost reduction)**, akses model paling canggih, **konten TIDAK dipakai untuk improve produk**.
- **Rate limits**: diukur RPM/TPM/RPD per project; gambar memakai IPM (images per minute). Nilai RPM/TPM/RPD per model ada di halaman `rate-limits`/AI Studio `[VERIFY]` — angka pasti free-tier baru diperoleh sebagian.
- **Structured output / JSON**: SUPPORTED ("Structured outputs", function calling; JSON mode).
- **Image**: `Imagen 4` **DEPRECATED — shutdown 2026-08-17**, migrasi wajib ke **Nano Banana** (`gemini-2.5-flash-image` keluarga). Output image via base64/image parts. (resmi: docs/imagen, last updated 2026-08-26).
- **Auth**: API key `x-goog-api-key` (Developer API) atau OAuth.
- **Terms/commercial**: paid tier diizinkan untuk production/commercial; **free tier = data dipakai melatih** → pertimbangan privasi prompt (Case Bible/solution = tergolong sensitif).
- **Silent charges risk**: pay-as-you-go dapat menimbulkan tagihan bila billing ON melebihi kuota; perlu quota/cap eksplisit.

### 1.2 DeepSeek API
(resmi: `api-docs.deepseek.com`)
- **Model** (2026-09): `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp`. Context 1M, max output 384K.
- **Harga resmi (per 1M token, USD)** (dikutip dari `Models & Pricing`):
  - Input cache-hit: flash off-peak $0.007 / peak $0.014; pro $0.022 / $0.044.
  - Input cache-miss: flash off-peak $0.22 / peak $0.44; pro $0.66 / $1.32.
  - Output: flash off-peak $0.66 / peak $1.32; pro $1.98 / $3.96.
  - Off-peak = 01:00–04:00 & 06:00–10:00 UTC, Sen–Jum.
- **Free tier**: TIPDAK tercantum — kolom billing = potong saldo top-up atau "granted balance" (promosi). Tidak ada free tier permanen yang diiklankan.
- **Rate limit**: **concurrency** (tingkat akun) — flash 2500, pro 500; `user_id` isolation (control safety, KV-cache, scheduling). Tidak ada hitungan token/min harian yang ditampilkan di halaman resmi.
- **JSON output**: SUPPORTED (Json Output ✓, Tool Calls ✓, Responses API ✓, Anthropic API ✓).
- **Image**: TIDAK ADA image generation API (hanya visi input via flash-vision; output teks). → **TIDAK dapat menjadi image provider.**
- **Auth**: API key (OpenAI-format base `api.deepseek.com` / Anthropic-format).
- **Terms/commercial**: boleh komersial (bayar per pakai, prepaid).
- **Silent charges risk**: prepaid → saldo habis = layanan berhenti (bukan over-limit silently), tetapi tidak ada "free buffer" default.

### 1.3 Provider lain
Tidak dievaluasi karena di luar scope instruksi & tidak jelas menambah nilai dalam kendala yang ada:
- OpenAI / Anthropic: relevan secara umum, tetapi instruksi membatasi "provider lain hanya jika benar-benar relevan"; Gemini sudah mencakup **text + image** dan DeepSeek sudah mencakup **text murah**. Tidak perlu.

---

## 2. Pemetaan capability → provider yang layak

| Capability | Gemini (Nano Banana + Flash) | DeepSeek (V4 Flash) | Kesimpulan struktural |
|---|---|---|---|
| **Text / Case Generator** | ✅ Flash free tier (tokens gratis dalam quota) | ✅ sangat murah, prepaid | **Keduanya layak**; beda di free tier vs pembayaran/privasi |
| **Runtime Narrative** | ✅ Flash-Lite free tier (low-freq), atau deterministik | ✅ murah per call | Keduanya layak; runtime bisa tetap deterministik |
| **Image Generation** | ✅ **NU** Nano Banana (Imagen deprecated) | ❌ TIDAK ADA image API | **Satu-satunya image = Gemini Nano Banana** → keputusan image "default" tanpa pilihan |

Fakta penentu: karena DeepSeek tidak punya image API dan Imagen deprecated, **Image Generator wajib pakai Gemini Nano Banana** bila image di-generate.
---

## 3. COST MODEL (September 2026)

Notasi: angka DeepSeek **resmi**; angka Gemini gambar `[VERIFY]` (belum ter-quote) diberikan sebagai rentang estimasi yang **jelas ditandai** — jangan dianggap pasti. Semua dalam USD.

### 3.1 Case generation — 1 generated case
Teks: seed + full Case Bible JSON. Asumsi output **~8–15K tokens**, input (prompt+seed+conteks) **~5–15K tokens**.

| Provider | Conservative | Generous (retry & peak) | Catatan |
|---|---|---|---|
| Gemini 3.x Flash (free tier) | **$0.00** | **$0.00** (dalam kuota) | "Free input & output tokens" — berlaku selama volume di bawah RPD `[VERIFY]` |
| DeepSeek V4 Flash (off-peak) | input 15K×$0.22/M + output 12K×$0.66/M ≈ **$0.011** | 2 retry + input 30K×$0.44/M(peak) + output 36K×$1.32/M(peak) ≈ **$0.061** | prepaid |

### 3.2 Image generation — 1 case
Asumsi: **1 crime scene + 4 suspek portraits = 5 image utama**; + 2–5 aset opsional (lokasi/barang/evidence) = 7–10 total.

| Provider | Conservative | Generous | Catatan |
|---|---|---|---|
| Gemini **Nano Banana** (paid per image) `[VERIFY]` | 5 img × ~$0.03 ≈ **$0.15** | 10 img × ~$0.10 ≈ **$1.00** | **Per-image resmi `[VERIFY]`**; tiap gambar = 1 call (cached durable → tidak pernah di-regenerate per replay) |
| DeepSeek | — | — | TIDAK ADA image API |

### 3.3 Runtime narrative — 1 full case
Asumsi: satu sesi menghasilkan **±10–25 request** naratif (interogasi + konfrontasi + hint); per call kecil (output `maxTokens:250`, input ~1–2K).

| Provider | Conservative | Generous (25 call, peak) | Catatan |
|---|---|---|---|
| Gemini 3.x Flash-Lite (free tier) | **$0.00** | **$0.00** (dalam RPD) atau rate-limited | Free tokens; risiko utama = exceed kuota harian → paksa fallback deterministik |
| DeepSeek V4 Flash (off-peak) | 20 call × ~1.5K tok($0.22+$0.66/M) ≈ **$0.022** | 25 call peak ≈ **$0.09** | per-sesi |

> **Keputusan biaya utama** (fakta): **image adalah satu-satunya cost wajib** bila image di-generate (Nano Banana, paid per image, `[VERIFY]`). Text (case gen + narrative) bisa **$0 di free tier Gemini** dalam kuota, atau <$0.1/sesi di DeepSeek.

## 4. FREE-TIER CLASSIFICATION

| Capability | Gemini | DeepSeek | Kesimpulan |
|---|---|---|---|
| **Case Generator** (offline/admin, jarang) | **FREE-SAFE** (free tokens, volume kecil) | **FREE-LIMITED** (hanya granted/promosi; tanpa true free) | Gemini free tier → FREE-SAFE |
| **Image Generator** (must be durable) | **PAID-REQUIRED** (Nano Banana per image; free-image tier tak dapat diandalkan/menuntut verifikasi) | — | **PAID-REQUIRED** bila generate image; FREE-LIMITED bila memakai placeholder manual (Opsi A/B) |
| **Runtime Narrative** (per-aksi, frekuensi sedang) | **FREE-LIMITED** (wajib rate-limit + fallback deterministik; bisa melewati RPD) | **FREE-LIMITED** (prepaid, bukan truly free) | Deterministik (Opsi A) = **FREE-SAFE**; live = FREE-LIMITED |

Catatan penting: **free tier ≠ free API**. Free tier Gemini memang menyediakan token gratis dalam kuota, tapi (a) **konten dipakai untuk improve produk** (privasi prompt Case Bible/solution — sensitif), dan (b) rate-limit per hari membatasi. Untuk data solusi kanonik, opsi aman: (1) model "gemini" lokal/deterministik di runtime & free tier hanya untuk konten non-sensitif, atau (2) paid tier tiny (ops-out training).
---

## 5. ARCHITECTURAL RECOMMENDATION

Model tetap:
```
Application
  → AI Gateway (factory by AI_PROVIDER, rate/cost guard)
  → Provider Adapter (implementasi PintuAi / KontrakPenyediaGambar)
```
Game Engine / domain **tidak tahu provider** — hanya bergantung `PintuRendererNaratif`, `PintuAi`, `KontrakPenyediaGambar`.

### Provider per capability (rekomendasi berbasis fakta)

- **Case Generator → Gemini 3.x Flash (free tier)**, fallback **DeepSeek V4 Flash**.
  Alasan: offline/admin, volume sangat kecil → muat free tier Gemini ($0). DeepSeek = backup murah bila Gemini kuota/regulasi bermasalah. Struktur output JSON didukung keduanya.
- **Image Generator → Gemini Nano Banana** (TIDAK ADA alternatif dari DeepSeek; Imagen deprecated).
  Karena image adalah satu-satunya cost wajib & harus cached/durable → generate di admin, simpan ke storage objek, key `caseId:sceneId:planId`. Free-image tier tak bisa diandalkan → perlakukan sebagai paid; beri gerbang "image off" (placeholder) untuk menekan biaya.
- **Runtime Narrative → DETERMINISTIC (Opsi A) untuk beta resmi**; bila live AI diaktifkan, **Gemini 3.x Flash-Lite free tier** dengan rate-limit per-node + fallback deterministik.
  Alasan: narrative per-aksi berisiko melewati free-tier RPD & menabrak biaya; deterministik sudah fully playable. AI live = bonus opsional.
- **Provider fallback (umum)**: `RendererNaratifDeterministik` (tanpa provider) + `FakeAiProvider` dev. Untuk text, DeepSeek sebagai fallback Gemini; untuk image, placeholder/manual.

### Env (nanti, minimal — TIDAK diubah sekarang)
`AI_PROVIDER` (gemini|deepseek|fake), `AI_MODEL`, `GEMINI_API_KEY`/`DEEPSEEK_API_KEY`, `AI_IMAGE_ENABLED`, storage bucket. Gerbang `AI_ENABLED` (kini dead) dijadikan keputusan nyata.

---

## 6. BETA POLICY — rekomendasi final

| | **Option A — $0 beta** | **Option B — Low-cost AI beta** | **Option C — Hybrid** |
|---|---|---|---|
| Case | ✅ pre-generated AI case (Gemini Flash free) | ✅ pre-generated AI case | ✅ pre-generated (DeepSeek/Gemini, hampir $0) |
| Image | ⚠️ tambah manual / placeholder (atau over-fit free-image jika ada) | ✅ generated (Nano Banana, paid per image, cached durable) | ⚠️ offline/manual image generation (human/asset stock) |
| Runtime narrative | ✅ deterministik (zero AI runtime) | ⚠️ limited live narrative (Flash-Lite free, rate-limited) | ✅ deterministik |
| Cost utama | $0 (text dalam free tier) | image paid `[VERIFY]`/kasus + narrative ~$0 | minimal (image manual) |
| Privasi | ⚠️ free tier Gemini melatih pada prompt | sama | sama |
| Kompleksitas | rendah (tanpa provider runtime) | menengah (provider + cache + rate-limit) | menengah |

**Rekomendasi**: Mulai **Option A** untuk closed beta (zero cost, playable, target Vercel/Firebase free), dengan **Option C** sebagai evolusi terdekat (image offline/manual bila butuh visual; runtime tetap deterministik). **Option B** hanya jika visual AI menjadi nilai inti dan budget image disetujui — dan hanya setelah `[VERIFY]` per-image Nano Banana & kebijakan data-training.

Trade-off ringkas: A = paling murah & aman bebas biaya, tetapi tanpa gambar AI & tanpa narrator AI. B = paling "lengkap AI" tapi ada line-item image & perlu rate/cap untuk narrative. C = menyeimbangkan (text ~$0 + image manual + deterministik) dengan risiko kompleksitas manual.

---

## 7. PROVIDER_DECISION_REQUIRED = YES

Provider resmi belum dipilih untuk dikode. Sebelum "pin" provider, harus diketahui (daftar fakta yang belum atau perlu dikonfirmasi):

1. `[VERIFY]` **Gemini Flash / Flash-Lite harga per 1M token** (input+output) di paid tier — dari halaman pricing resmi (ter-extract sebagian; angka teks terpotong).
2. `[VERIFY]` **Gemini Nano Banana harga per image** dan apakah ada free-image quota yang dapat diandalkan.
3. `[VERIFY]` **Free-tier rate limit per model** (RPM/TPM/RPD) yang berlaku 2026-09 untuk memastikan volume beta muat (tanpa silent charge).
4. **Kebijakan data training**: apakah menerima free tier Gemini yang memakai prompt (termasuk konten Case Bible/kanonik) untuk improve produk; jika tidak → perlu paid tier / deterministik.
5. **Regional availability** Gemini untuk dataset deployment yang relevan; data residency DeepSeek (China) bila dipilih.
6. **Silent-charge guard**: mekanisme cap/quota (Gemini pay-as-you-go) atau mode prepaid (DeepSeek saldo habis-berhenti).
7. **Storage objek** untuk image durable: bucket + biaya egress Vercel→bucket, URL publik vs pre-signed.
8. **Structured-output** coupling: JSON mode/nanti JSON Schema untuk `KandidatKasus` & metadata asset.

> Rekomendasi saat ini (berdasarkan fakta resmi yang sudah terverifikasi): **Gemini (3.x Flash text + Nano Banana image) sebagai provider utama; DeepSeek V4 Flash sebagai fallback text murah/prepaid; runtime narrative deterministik (Opsi A→C).** Namun penguncian menunggu konfirmasi item 1–8. Closed beta tetap deterministik & playable tanpa provider.

---

**STOP — dokumen keputusan; tidak ada kode/SDK/env yang diubah.