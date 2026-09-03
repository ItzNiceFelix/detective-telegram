# AssetTask Human-in-the-Loop — Operator Runbook (Beta)

> `ASSET_GENERATION_BETA = HUMAN_IN_LOOP`, `AI_IMAGE_API_REQUIRED_FOR_BETA = NO`.
> Dokumentasi operasional — lihat `docs/AI-IMAGE-HUMAN-IN-LOOP-DECISION.md` untuk keputusan & spec.

## 1. Create task

1. Backend/offline memanggil `layananTugasAset.buatTugasAset(caseId, caseVersionId, VisualPlan)`.
   - Prompt kanonik dibangun otomatis dari VisualPlan (`PembuatPromptVisual`) — **jangan** membuat prompt baru di handler Telegram.
   - Identity dedup: `caseId:sceneId:planId` → memanggil dua kali dengan identity sama mengembalikan task yang sama (tidak ada task kedua).
2. `layananTugasAset.kirimTugasAset(taskId)` → bot `sendMessage` ke Asset Vault, task menjadi `WAITING_FOR_ADMIN`, `telegramMessageId` tersimpan di Firestore (`asset_tasks/<taskId>`).

## 2. Asset Vault setup

- Private Telegram **channel**, terpisah dari gameplay groups.
- Konfigurasi `TELEGRAM_ASSET_VAULT_CHAT_ID` di environment. Tanpa vault yang dikonfigurasi, semua kiriman foto di-ignore.
- Bot harus bisa mengirim pesan di channel dan menerima photo reply dari admin. Admin vault = `creator` / `administrator` (cek `getChatMember`, fail-closed).

## 3. Admin reply protocol

- Bot mengirim task message berisi: `[ASSET TASK] <taskId>`, Case, CaseVersion, Scene, Asset Type, Required visual clues, Prompt, dan instruksi *"Balas pesan ini dengan hasil gambar."*
- Admin **me-reply task message** dengan gambar.
- Bot membaca `message.photo[].file_id` (resolusi tertinggi), `chat.id`, `from.id`, `reply_to_message.message_id`, ukuran.
- Validasi: chat == vault, pengirim admin vault, message adalah reply, `reply_to_message.message_id` cocok dengan `telegramMessageId` suatu task, status task menerima (WAITING_FOR_ADMIN / REJECTED / SUBMITTED), foto ada, ukuran ≤ batas.
- Random image tanpa AssetTask → **di-ignore** (tidak menjadi asset).

## 4. Verify

- Admin action: `verifyAssetTask` (endpoint `/api/admin.ts`, authenticated + authorized + auditable).
- Alur: `SUBMITTED → VERIFYING → VERIFIED`, `verifiedAt` diset, `VERIFIED_BY_ADMIN`.
- Membentuk `AsetVisual` `TELEGRAM_BETA` (`BEST_EFFORT`, uri = `file_id`) dan menuliskannya ke manifest visual (`visual_assets` + `visual_asset_manifests`). Binary tidak disimpan di Firestore.
- Asset VERIFIED memenuhi publish gate AI-candidate.
- Duplicate verify → idempotent (tidak membuat asset kedua).

## 5. Reject

- Admin action: `rejectAssetTask` (payload `taskId`, `reason`).
- Alur: `SUBMITTED/VERIFYING → REJECTED → WAITING_FOR_ADMIN`; rejection reason tersimpan (bounded 500).
- Tidak menghapus asset VERIFIED lain yang valid.

## 6. Resubmit

- Task di `WAITING_FOR_ADMIN` / `REJECTED` / `SUBMITTED` (belum VERIFIED) dapat menerima gambar baru (mengganti candidate).
- Task `VERIFIED` → immutable; submission/tolak ditolak. Perubahan pasca-verified wajib lewat revision/replacement explicit atau task baru — jangan overwrite silent.

## 7. Troubleshooting

- **Submission ignored**: bukan vault chat, bukan reply, atau reply ke pesan yang bukan task → cek `TELEGRAM_ASSET_VAULT_CHAT_ID` dan bahwa task message dikirim ke vault yang dikonfigurasi.
- **Submission rejected**: non-admin, status tidak menerima, tanpa `file_id`, atau ukuran melebihi batas.
- **Publish 422 "belum VERIFIED"**: ada mandatory asset yang belum diverifikasi → jalankan `verifyAssetTask` dulu.

## 8. Stale / expired task

- Task dapat ditandai `EXPIRED` bila melewati masa berlaku; status `EXPIRED` tidak menerima submission. Untuk melanjutkan, buat task baru (identity boleh sama — operator membuat task/plan baru).

## 9. Invalid `file_id` recovery

- `file_id` = **BEST_EFFORT**; bila send gagal / `file_id` rusak saat gameplay → tandai asset `SUSPECT`/`UNAVAILABLE` (jika model status mendukung), **tanpa auto-regenerate**.
- Recovery: admin membuat task/revisi baru, submit gambar baru, verify → reference baru; buat CaseVersion baru bila truth berubah (immutable).

## 10. Migration to Firebase Storage (future)

- `file_id` hanyalah **beta provider reference**; asset reference tetap **provider-abstract**.
- Migrasi Firebase Storage terjadi **hanya di adapter/manifest layer** — tidak menyentuh CaseVersion/GameEngine. Repository `repositoriAsetVisual` & manifest tetap; yang berubah adalah cara penyimpanan binary (`penyimpananGambar`) dan format reference (`gs://...`).

---
Storage contract beta: `provider=TELEGRAM_BETA`, `reference=file_id`, `durability=BEST_EFFORT`, `verifiedAt` set, `caseId/sceneId/planId` utuh, `VERIFIED_BY_ADMIN`. Tidak ada binary di Firestore.

Final flags:
`ASSET_GENERATION_BETA = HUMAN_IN_LOOP`, `AI_IMAGE_API_REQUIRED_FOR_BETA = NO`, `AI_IMAGE_AUTOMATION_FUTURE = YES`.