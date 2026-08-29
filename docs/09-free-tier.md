# 09 — Free-Tier & Cost Strategy

## 9.1 Target platform posture

Target awal:

- Vercel Hobby/free-tier untuk serverless runtime.
- Firebase/Firestore free tier untuk state.
- Telegram Bot API sebagai interface.
- AI/image provider melalui gateway abstraction.

**Catatan:** quota dan pricing vendor dapat berubah. Nilai konkret harus diverifikasi kembali sebelum production deployment.

## 9.2 Cost-sensitive design

Hal yang paling harus dihemat:

1. AI image generation.
2. AI text generation.
3. Firestore reads/writes.
4. Outbound network calls.
5. Duplicate Telegram sends.

## 9.3 Recommended AI strategy

### Open beta

- Pre-generated case library.
- Batch image generation.
- Optional AI assistant.
- Limit per-group active case.

### Avoid by default

- generate image on every inspect;
- generate new narrative for every message;
- full chat summarization on every update.

## 9.4 Data strategy

Prefer:

```text
immutable case
+ small mutable session
+ aggregate stats
```

daripada:

```text
full message archive
+ full event log forever
```

## 9.5 Quota protection

Implement:

- per-group daily AI budget;
- per-user action rate limit;
- global feature flags;
- circuit breaker;
- usage counters;
- graceful degradation.

## 9.6 Graceful degradation

Jika AI unavailable:

- existing case tetap playable;
- hints deterministic tetap aktif;
- new case generation dapat dipause;
- AI assistant dapat dimatikan.

## 9.7 Storage

Image assets sebaiknya tidak disimpan sebagai giant Firestore documents. Simpan object reference/URL/file identifier/metadata sesuai provider.

## 9.8 Closed Beta (1 grup, 6 player) — kelayakan free-tier (BARU)

Dengan scope diubah menjadi 1 grup / 30 member / maks 6 player aktif / 1 session per
grup (lihat 02-product-scope.md 2.0):

- Volume Firestore read/write hanya berasal dari aksi ≤6 player, bukan seluruh 30
  member — jauh di bawah kuota harian free tier (Spark) untuk skenario ini.
- Spectator (24 member sisanya) tidak memicu write apa pun; mereka murni membaca
  pesan yang sudah dikirim bot ke grup.
- Callback dari non-player ditolak di awal dengan 1 read murah (`playerIds` check),
  bukan menjalankan game engine penuh — mencegah biaya tak perlu dari user iseng.
- Risiko biaya AI (image/text generation) tetap ada per case baru yang di-generate,
  namun dengan cooldown "case baru" dan mekanisme lanjut case lama yang belum solved
  (bukan generate ulang), frekuensi generasi case baru jauh lebih jarang dibanding
  skenario open beta multi-grup sebelumnya.

**Kesimpulan:** untuk skala ini, closed beta layak dijalankan sepenuhnya di Vercel
Hobby + Firebase Spark tanpa perlu circuit breaker seketat versi open-beta publik,
namun cost counter untuk AI generation tetap disarankan sebagai jaring pengaman.

## 9.9 Free-tier feasibility criterion

Produk layak tetap free-tier friendly selama:

- case asset generation dilakukan offline/batch;
- live requests mayoritas hanya membaca small state;
- query Firestore terbatas;
- AI runtime bukan dependency setiap interaction.
