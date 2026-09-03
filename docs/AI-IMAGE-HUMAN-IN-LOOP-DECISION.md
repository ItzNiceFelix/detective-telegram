# AI Image — Human-in-the-Loop (Beta) Decision

> Status: **FINAL BETA DECISION**
> Berlaku untuk Beta. Tidak mengubah Game Engine / CaseSession / Evidence / Proof / Interrogation / gameplay.

## FINAL BETA DECISION

Image generation untuk **Beta** menggunakan:

```text
HUMAN_IN_LOOP
```

**Bukan** server-side AI image generation.

- AI Text Case Generator tetap enabled jika provider tersedia.
- Abstraksi image provider **tetap dipertahankan** untuk future automation.
- Tidak ada dependency baru; tidak ada source yang diubah oleh dokumen ini.

---

## FLOW

```text
AI Case Generator
→ Case Bible
→ VisualPlan
→ AssetTask
→ Telegram private Asset Vault
→ admin generates image (external/manual tool)
→ admin replies dengan image ke AssetTask
→ bot menerima Telegram photo
→ capture Message.photo[].file_id
→ validate
→ asset manifest
→ admin verification
→ CaseVersion publish
```

---

## ASSET TASK

Entity baru pada layer application/domain (belum diimplementasikan di sini):

### `AssetTask` — field minimal

| Field | Tipe/semantik |
| ----- | ------------- |
| `taskId` | identitas unik task |
| `caseId` | kasus terkait |
| `caseVersionId` | versi kasus yang menjadi konteks asset |
| `sceneId` | scene terkait |
| `planId` | VisualPlan terkait |
| `assetType` | tipe aset (mis. `CRIME_SCENE` / `LOCATION` / `PORTRAIT` / `EVIDENCE_CLOSEUP` / `REVEAL`) |
| `prompt` | generation prompt untuk admin |
| `requiredClues` | daftar clue visual yang wajib muncul |
| `status` | lihat daftar status di bawah |
| `telegramMessageId` | hasil bot (task message) di vault |
| `telegramFileId` | hasil upload/submission admin (`Message.photo[].file_id`) |
| `submittedBy` | user Telegram yang submit (admin) |
| `submittedAt` | waktu submission |
| `verifiedAt` | waktu verifikasi |

### Status task

- `DRAFT` — dibuat, belum dikirim ke vault
- `WAITING_FOR_ADMIN` — task message sudah terkirim, menunggu submission admin
- `SUBMITTED` — admin sudah me-reply gambar; menunggu verifikasi
- `VERIFYING` — submission sedang divalidasi
- `VERIFIED` — asset diterima dan memenuhi publish gate
- `REJECTED` — submission ditolak; task kembali ke `WAITING_FOR_ADMIN`
- `EXPIRED` — task melewati masa berlaku dan tidak dapat di-submit lagi

Transisi yang diizinkan (contoh):

```text
DRAFT → WAITING_FOR_ADMIN
WAITING_FOR_ADMIN → SUBMITTED           (admin me-reply gambar pada task message)
SUBMITTED → VERIFYING
VERIFYING → VERIFIED | REJECTED
REJECTED → WAITING_FOR_ADMIN            (task aktif lagi; rejection reason tersimpan)
VERIFIED → (terminal; perubahan lewat revisi/task baru, bukan overwrite diam-diam)
WAITING_FOR_ADMIN → EXPIRED
```

---

## ADMIN FLOW

### Bot mengirim task message (ke Asset Vault, private channel)

Task message memuat:

- case
- scene
- asset type
- generation prompt
- required visual clues
- task ID

### Admin mengirim hasil gambar

Admin me-**reply** task message dengan gambar.

### Validasi yang harus dilakukan bot sebelum menerima submission

- **authorized admin** — user yang me-reply adalah admin yang sah
- **correct vault chat** — hanya chat vault, terpisah dari gameplay groups
- **replyToMessageId** — harus memetakan ke `AssetTask` yang ada
- **task status accepts submission** — valid dari status saat ini (mis. `WAITING_FOR_ADMIN` / `SUBMITTED` sebelum VERIFIED)
- **expected media type** — foto, sesuai jenis asset
- **image size/type limits** — batas operasional (tipe `image/png|jpeg|webp`, batas ukuran)

---

### Aturan

Random image **tanpa `AssetTask`** tidak boleh menjadi asset.

## VERIFICATION

Beta menggunakan:

```text
VERIFIED_BY_ADMIN
```

Tidak perlu AI vision pada Beta.

Admin harus dapat:
- **verify** → task menjadi `VERIFIED`, asset memenuhi publish gate
- **reject** → task kembali ke `WAITING_FOR_ADMIN`, rejection reason tersimpan (bounded)

---

## STORAGE

Beta:

```text
TELEGRAM_BETA
```

Yang disimpan:

- Telegram `file_id`
- provider
- durability = **`BEST_EFFORT`**
- task ID
- scene ID
- plan ID
- verifiedAt

Kebijakan:
- **Tidak menyimpan binary di Firestore.** (Firestore hanya metadata/ref.)
- Replay memakai **`file_id`**.
- **Jangan gunakan `getFile()` untuk replay** kecuali benar-benar diperlukan.

`file_id` adalah referensi provider-abstract — bukan durable URI. Failure runtime → asset `SUSPECT`/`UNAVAILABLE`, recovery mengarah ke regenerasi/revisi (lihat Recovery).

---

## PUBLISH

Kasus yang membutuhkan visual asset:

```text
DRAFT
→ WAITING_FOR_ASSETS
→ assets verified
→ PUBLISHED
```

- **Jangan publish** jika mandatory asset belum **VERIFIED**.
- Non-visual case boleh memakai existing publish path sesuai specification.

---

## AI

- Image provider AI **tidak wajib** untuk beta.
- Set flag:

```text
AI_IMAGE_ENABLED=false
```

- AI Text Case Generator tetap enabled jika provider tersedia.
- Abstraksi image provider tetap dipertahankan untuk future automation.

---

## TELEGRAM

- Gunakan existing **`/api/telegram.ts`**.
- **Tidak membuat API endpoint baru.**
- Asset submission masuk melalui **webhook yang sama**.
- Asset Vault harus **private** dan **terpisah** dari gameplay groups.

---

## FUTURE

```text
Human-in-loop
→ optional automatic AI image generation
```

Tanpa perubahan terhadap:
- Game Engine
- CaseSession
- Evidence
- Proof
- Interrogation
- gameplay

---

## DEDUP

Asset identity tetap:

```text
caseId:sceneId:planId
```

Submit ulang terhadap task yang sama:
- **tidak boleh** membuat duplicate manifest
- **dapat mengganti candidate** sebelum verification
- setelah **VERIFIED**, perubahan harus membuat **explicit revision/replacement record** atau **task baru**

Jangan overwrite immutable published asset secara diam-diam.

---

## MINI APP

- Asset reference tetap **provider-abstract**.
- Telegram `file_id` hanya **beta provider reference**.
- Future Firebase Storage migration harus tetap **hanya berada di adapter / manifest layer**.

---

## COST

- Beta image generation **cost ke aplikasi**: `$0 API image generation`
---

## DOCUMENTATION (operator runbook)

### 1. Admin workflow

1. Bot (di backend) membuat `AssetTask` untuk tiap `VisualPlan` kasus yang butuh visual.
2. Bot mengirim task message ke Asset Vault (private channel): case / scene / asset type / prompt / required clues / task ID.
3. Admin membuat/mengambil gambar via tool external/manual.
4. Admin **me-reply task message** dengan gambar.
5. Bot menerima `photo`, memvalidasi (authorized admin / correct vault / replyToMessageId→AssetTask / status / media type / limits), men-set `SUBMITTED`, capture `Message.photo[].file_id`.
6. Admin verify / reject (mekanisme admin, webhook sama; verifikasi manual oleh admin).
7. Verified asset masuk manifest → memenuhi publish gate → `PUBLISHED`.

### 2. Asset Vault setup

- Private Telegram **channel** terpisah dari gameplay groups.
- Bot harus bisa mengirim media di channel dan menerima photo reply dari admin.
- Konfigurasi `TELEGRAM_ASSET_VAULT_CHAT_ID` + bot token; vault **tidak** diekspos ke pemain.

### 3. Task/reply protocol

- Identitas task: `taskId`.
- `replyToMessageId` harus tepat sasaran ke task message yang belum terminal.
- Satu task message = satu sesi pengumpulan; sebelum verifikasi boleh ganti candidate (re-submit).

### 4. Verification

- Admin setujui → `VERIFIED`, `verifiedAt`, `VERIFIED_BY_ADMIN`.
- Asset siap memenuhi publish gate (jika mandatory).

### 5. Rejection

- Admin tolak → task kembali `WAITING_FOR_ADMIN`; rejection reason tersimpan (bounded).
- Candidate sebelumnya boleh ditimpa dengan re-submit (belum verified).

### 6. Recovery

- Runtime failure (mis. `file_id` tak valid, send gagal): tandai asset `SUSPECT`/`UNAVAILABLE`, **tidak** auto-regenerate.
- Recovery: admin membuat task/revisi baru (verified → revision/replacement **explicit**, bukan overwrite silent).

### 7. Stale / expired task

- Task melewati batas waktu → `EXPIRED`, tidak menerima submission lagi.
- Untuk melanjutkan, butuh `AssetTask` baru.

### 8. file_id limitations

- `file_id` = **BEST_EFFORT**; bisa tidak valid bagi server/bot lain; `getFile` hanya bila benar-benar perlu.
- Jangan jadikan durable canonical URI; hanya referensi beta.
- Jangan simpan binary di Firestore.

---

## Final flags

```text
ASSET_GENERATION_BETA = HUMAN_IN_LOOP
AI_IMAGE_API_REQUIRED_FOR_BETA = NO
AI_IMAGE_AUTOMATION_FUTURE = YES
```