# Telegram Asset Vault — LIVE Smoke Result

> Status: **PASS** (end-to-end live flow diverifikasi dengan real Telegram + real Firestore).
> Final verdict: **`LIVE_TELEGRAM_ASSET_SMOKE = PASS`**.
> Durability: **`TELEGRAM_BETA = BEST_EFFORT`** (file_id bukan durable — tidak mengklaim storage durable).

Dokumen mencatat smoke secara jujur: semua bukti berasal dari Telegram/Firestore nyata. Tidak ada secret yang dicetak/dipersist. Step 8 (replay ke gameplay chat) **dilewati** atas permintaan user.

---

## 1. Precheck (status only, tanpa nilai)

| Variabel | Status |
| -------- | ------ |
| `TELEGRAM_BOT_TOKEN` | SET |
| `TELEGRAM_SECRET` | SET (webhook secret valid) |
| `TELEGRAM_ASSET_VAULT_CHAT_ID` | SET = `-5594167938` (group, numerik) |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | SET (cert eksplisit) |

`GOOGLE_APPLICATION_CREDENTIALS` kosong (tidak dipakai; cert eksplisit digunakan).

## 2. Vault nyata yang dipakai

- Chat: group **`testping`** (type `group`, id `-5594167938`, tanpa username).
- Bot: `AnjayDetektifBot` — status **administrator** di vault (`getChatMember`).
- Validasi admin vault (creator/administrator) berjalan via `getChatMember` → cocok untuk group.
- Webhook: `https://detective-telegram.vercel.app/api/telegram`, `pendingUpdateCount=0`, tanpa last error.

## 3. Table — hasil live

| Check                       | Result       | Evidence |
| --------------------------- | ------------ | -------- |
| Real task creation          | **PASS**     | `task-mtlqvm7h-sfw8ov`, `LIVE-SMOKE-001`, `LIVE-SMOKE-001-V1`, `ROOM_407`, `LIVE-PLAN-001`, `CRIME_SCENE` |
| Real Telegram task message  | **PASS**     | `telegramMessageId=66` di group `-5594167938` |
| Real admin reply            | **PASS**     | reply image di Telegram di-*receive* deployed webhook (`pending=0`, 200) |
| `file_id` capture           | **PASS**     | `telegramFileId=AgACAgU…` (resolusi tertinggi) |
| Firestore persistence       | **PASS**     | `asset_tasks/<taskId>` status `SUBMITTED`; `submittedBy=1817932703`, `submittedAt=2026-09-03T16:41:19Z`, `width=1280/height=698/sizeBytes=97257`; **tanpa binary** |
| Admin verification          | **PASS**     | → `VERIFIED`, `verifiedAt=2026-09-03T16:51:09Z` |
| visual_asset manifest       | **PASS**     | `visual_assets/LIVE-SMOKE-001:ROOM_407:LIVE-PLAN-001` → `READY`, `TELEGRAM_BETA`, `BEST_EFFORT`, `VERIFIED_BY_ADMIN`, ref `file_id`, **tanpa binary** |
| Publish gate                | **PASS** *(non-destructive)* | cover by 53 test: manifest incomplete → 422; asset belum VERIFIED → 422; semua VERIFIED → OK. Tidak publish ke case nyata (menghindari mutasi produksi). |
| Replay via `file_id`        | **SKIPPED**  | atas permintaan user |
| Dedup                       | **PASS**     | `buatTugasAset` identity sama → taskId sama (idempotent); asset VERIFIED keyed-by-identity tunggal |
| Fresh-process read          | **PASS**     | proses baru baca Firestore (task+asset) tanpa in-memory carry |
| Security checks             | **PASS**     | wrong-vault → ignored; random reply → ignored; non-admin → rejected; submit ulang VERIFIED → rejected (immutable); 53 automated tests pass |

---

## 4. Diagnosis & Fix (riwayat)

**Percobaan 1 — channel `@Anjaysyuhu`:** webhook sehat (`pending=0`, 200) tapi reply tidak tersimpan.
Akar masalah: `TELEGRAM_ASSET_VAULT_CHAT_ID` = username `@Anjaysyuhu`, sedangkan `chat.id` inbound numerik
`-1003974020415` → `terimaPengirimanAset` → `ignored ("bukan vault chat")` → 200 silent tanpa persist.
**Plus** vault adalah **channel** (`type=channel`, tanpa discussion group): channel post tiba sebagai
`update.channel_post` (bukan `message`) dan tanpa `from` (pengarang = channel) → path submission tidak
pernah menangani-nya. Human-in-the-loop berbasis reply tidak kompatibel dengan channel polos.

**Perbaikan:** pindah vault ke **group** (real sender + `message` + numerik `chat.id`).
`TELEGRAM_ASSET_VAULT_CHAT_ID` di `-5594167938` di Vercel env + `.env` lokal. No code change.

**Percobaan 2 — group:** bikin task baru (msg 66), admin reply image → **tersimpan**.
Konfirmasi: `SUBMITTED` + `telegramFileId` + `submittedBy/At` (bukti di §3).

**Catatan desain:** bot **tidak** membalas pesan konfirmasi pada `accepted/rejected/ignored`
(handler tidak memanggil `sendMessage` pada path submission). Ketidakhadiran notifikasi "received"
**bukan** kegagalan — alur bekerja tanpa ACK.

---

## 5. Handoff / catatan operasional

- Daftar permanen bot sebagai admin vault group.
- Admin yang me-reply harus `creator`/`administrator` di vault (getChatMember, fail-closed).
- Replay (Step 8) bisa ditambahkan nanti: `sendPhoto` dengan `photo=<stored file_id>` ke gameplay chat
  dan dedup; tanpa image gen / `getFile` / Firebase Storage.

---

Trade-off kejujuran: `TELEGRAM_BETA = BEST_EFFORT` (file_id bukan durable). Jangan mengklaim durable
storage. Smoke ini **PASS** untuk alur (real Telegram + real Firestore, reply→SUBMITTED→VERIFIED),
tetapi **bukan** garansi durability penyimpanan jangka panjang.