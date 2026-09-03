# Final Beta-Blocker Audit — Detective Telegram

**Status**: Audit pasca-resolusi blocker beta
**Ruang lingkup**: Beta Blocker Resolution untuk **BLOCKER 1–4**.
**Keputusan akhir**: **`BETA_READY = NO`** (blocker 1–4 tuntas dan teruji; seluruh P0/P1 operasional belum bisa diverifikasi — lihat §9–§10).

---

## 1. Blocker sebelum fix

| # | Blocker | Ringkasan |
|---|---------|-----------|
| 1 | **Produksi `/join`** | `/join` belum ter-wire ke production Telegram path; group tidak dapat mencapai 6 detective aktif lewat jalur nyata. |
| 2 | **Input validation** | `validasiInputTelegram` / security helper didefinisikan tetapi tidak dipakai di production path (dead-code); batas panjang input tidak ditegakkan. |
| 3 | **Game mutation security guard** | `amanUntukMutasiGame` tidak menjadi gerbang nyata sebelum mutasi; risiko mutasi tanpa authorization/context yang sesuai. |
| 4 | **Admin** | `api/admin.ts` hanya stub "202 pending"; tidak menjalankan operasi beta yang diwajibkan; risiko arbitrary mutation / bocor secret. |

## 2. Root cause

1. **`/join`** diimplementasi di domain (`tambahDetektifKeSesi`: max-6, idempoten) tetapi tidak di-route dari `KomandoTelegramLayanan.prosesUpdate`. Spectator tidak pernah bisa menjadi detective lewat produksi.
2. **Input validation** helper di `src/security/audit.ts` tidak dipanggil pada boundary aplikasi; batas command/argument/ID/free-text tidak di-enforce.
3. **Mutation guard** `amanUntukMutasiGame(context, groupAccess)` tidak dipanggil untuk command gameplay.
4. **Admin** endpoint lama mengembalikan `202 + "pending implementation"` tanpa menyentuh repository; `rejectCandidate`/`regenerateCase` mengembalikan 202 (diterima) padahal tak pernah diimplementasikan.

## 3. Files changed

- `src/application/services/komando-telegram.ts` — wiring `/join` (B1), boundary validasi (B2), mutation guard (B3).
- `api/admin.ts` — implementasi admin ketat (B4).
- `tests/integration/join-telegram.test.ts` — 11 test join.
- `tests/unit/input-validation.test.ts` — 3 test B2.
- `tests/integration/security-mutation.test.ts` — 3 test B3.
- `tests/integration/admin.test.ts` — 7 test B4.
## 4. Join flow

```
Telegram /join
  → KomandoTelegramLayanan.prosesUpdate (aplikasi)
      → validasiGroupTelegram (grup terdaftar & ACTIVE)
      → validasiAksesTelegram (getChatMember — member grup; same-group)
      → validasiInput (B2)
      → amanUntukMutasiGame(userId, chatId, aksesValid) (B3)
      → joinSesi(groupId, userId, chatId, updateId)
          → preflight state (non-terminal)
          → SATU transaction Firestore:
              read grup (tx) → klaim idempotency key
              read sesi (tx) → state gate (LOBBY saja)
              → tambahDetektifKeSesi (max-6 + anti-duplikasi — domain)
              → simpan sesi (tx)
              → event PLAYER_JOINED (atomic di tx bila publisher mendukung;
                 fallback post-commit PERSIST-07)
          → response Telegram (UX)
```

**Contract yang ditegakkan**:
- Hanya sesi valid/playable: sesi harus ada; state gate menolak OPEN/PAUSED/CLEARED/ARCHIVED.
- Participant dari group yang sama: sesi di-scope lewat `grup.activeCaseSessionId` + keanggotaan Telegram server-side.
- Maks 6 detective aktif: ditangani **`tambahDetektifKeSesi`** (`BATAS_DETEKTIF_AKTIF=6`), bukan rule baru di handler.
- Spectator tidak otomatis detective tanpa `/join`: tidak ada jalur lain yang menambah `playerIds`.
- Duplicate join idempotent: domain helper mengembalikan sesi apa adanya; tidak ada duplicate; response ramah.
- Concurrent join transactional: semua mutasi dalam 1 transaction Firestore.
- User yang sudah join tidak membuat participant duplicate: anti-duplikasi domain.
- CLEARED/ARCHIVED menolak join: state gate.
- Participant status konsisten dengan model Player/Group existing.
- **Join hanya saat LOBBY** (docs/03 §3.2.1; docs/02 — tombol join nonaktif setelah lobby ditutup; docs/BETA-READINESS — spectator tidak join mid-session). Mencegah perubahan kuorum accusation di tengah OPEN.

**UX response (Telegram)**:
- Berhasil: `Anda bergabung sebagai Detective aktif (N/6).`
- Sudah join: `Anda sudah menjadi Detective aktif pada sesi ini.`
- Penuh: `Sesi sudah mencapai batas maksimum 6 detective aktif.`
- Tidak ada sesi: `Tidak ada sesi aktif. Admin grup dapat memulai dengan /newcase.`
- State tidak mengizinkan: pesan spesifik untuk OPEN/PAUSED/CLEARED/ARCHIVED.

## 5. Concurrency semantics

- **Compare-and-set dalam 1 transaction Firestore** (PERSIST-04). Dua `/join` pada slot terakhir (5→6) dieksekusi berurutan oleh transaction (retry on conflict). Pertama baca 5 → tambah → 6 → commit. Kedua baca 6 → `tambahDetektifKeSesi` melempar `KesalahanValidasi` (penuh) → ditolak; mutasi di-rollback.
- **Idempotency key per `update_id`**: duplicate delivery → klaim kedua `sudahAda=true` → `KesalahanIdempoten` → safe replay tanpa mutasi kedua → response "sudah diproses".
- Bukti:
  - `participant count tidak pernah > 6` (teruji menetap 6).
  - `tidak ada duplicate player ID` (teruji set 6 unik).
  - Tepat satu diterima, satu ditolak (teruji).
  - Tidak ada check-then-write non-atomic (read+write dalam transaction sama).
  - Bug nyata ditangkap: dispatch `/join` memakai `return this.joinSesi(...)` tanpa `await` → rejection `KesalahanIdempoten` luput dari `try/catch`; diperbaiki menjadi `return await`.

## 6. Security boundary

- **B2 — validasi input (SATU boundary di `prosesUpdate`)**:
  - `validasiInputTelegram(text, MAKS_PANJANG_TEKS_INPUT=500)` (docs/BETA-READINESS — text max 500).
  - Per-argumen/ID: `validasiInputTelegram(arg, MAKS_PANJANG_ARGUMEN=128)`.
  - `MAKS_JUMLAH_ARGUMEN=20` (bounded list).
  - Semua berhenti **sebelum** dispatch mutasi; tidak diduplikasi per command.
  - Callback data: `parseUpdate` tidak me-route `callback_query` ke mutasi apapun (tidak ada jalur callback→mutation), sehingga tidak relevan sebagai jalur mutasi; seluruh input tetap melewati batas panjang yang sama.
- **B3 — mutation guard** di-apply ke `KOMANDO_MUTASI_GAMEPLAY` = {`/newcase`,`/startcase`,`/join`,`/investigate`,`/inspect`,`/interrogate`,`/confront`,`/theory`,`/accuse`,`/vote`,`/finalize`}. `amanUntukMutasiGame(userId, chatId, aksesValid)` melempar `KesalahanAutorisasi` bila bukan member; hasil **dicek (throw), tidak pernah diabaikan**. Otorisasi per-aksi (harus detective aktif) ditegakkan di **domain** (`playerIds.includes(userId)`).
- **Spectator & non-member tidak dapat mutasi gameplay** — teruji.

## 7. Admin scope

Admin **ketat** untuk beta — hanya operasi yang diwajibkan:
- `publishCase`: satu-satunya cara DRAFT→PUBLISHED tanpa mutasi Firestore manual (offline/admin build, docs/26.15). Idempoten bila sudah PUBLISHED; tolak bila DISABLED.
- `inspectSession`: read-only diagnostik sesi.
- `forceArchive`: operasional untuk sesi stuck; **mengikuti state machine** (PAUSED/LOBBY/CLEARED→ARCHIVED; tolak OPEN karena tetap perlu jeda dulu).
- `healthDiagnostic`: status tanpa secret.
- `rejectCandidate` / `regenerateCase`: **TIDAK diimplementasikan** (pipeline AI real-time di luar scope beta) → respons `501 manual_operation`, terdokumentasi, bukan endpoint boneka ber-202.

Keamanan admin: authenticated (ADMIN_SECRET_TOKEN, header/body) + rate-limited + **auditable** (`catatAuditAdmin`: actor, action, result, refs, timestamp) + **tidak pernah menampilkan token ke response/log** + **tidak ada arbitrary Firestore mutation** (semua operasi parametrik & bertipe).
## 8. Test results

- **Full test suite**: `npm test` → **225 pass / 0 fail / 0 skipped** (baseline 201 sebelum blocker + 24 baru).
- **Typecheck**: `npm run typecheck` → **clean (0 error TS)**.
- Build: tidak ada script `build` di `package.json` → gate kompilasi = typecheck (bersih).
- New join tests (11) hijau: normal, duplicate join, full, concurrent join, wrong group, no active session, paused, open, cleared, archived, idempotent duplicate Telegram update.
- Security mutation tests (3) hijau: non-member ditolak semua command mutasi; spectator tidak bisa mutasi; detective sah diizinkan.
- Input validation tests (3) hijau: argumen/ID >128 ditolak; teks >500 ditolak; >20 argumen ditolak — semuanya sebelum mutasi.
- Admin tests (7) hijau: 401 tanpa token; healthDiagnostic tanpa secret; publishCase idempoten & 404; inspectSession read-only; forceArchive PAUSED→ARCHIVED & OPEN ditolak; reject/regenerate → 501 manual; action tak dikenal → 400 (tanpa arbitrary mutation).

## 9. Remaining P0

Tidak ada P0 gameplay-blocker yang diketahui tersisa di ruang lingkup blocker 1–4 (semua telah diresolusi dan teruji). Operasional/deployment di bawah tetap **harus diverifikasi sebelum claim P0 bersih** (di luar kode):

- Deployment nyata diverifikasi ≤12 Vercel function dan Firestore indexes di-review (docs/25 acceptance gate #10–#11) — belum dieksekusi di environment produksi.
- Rollback procedure di-exercised (docs/25 #12; docs/PRODUCTION-RUNBOOK) — belum dieksekusi.
- **Catatan penting**: dokumen input `docs/FINAL-PRODUCTION-AUDIT.md` (enumerasi P0/P1 sebelumnya) tidak lagi ada di working tree saat audit ini berjalan; daftar P0/P1 di bawah didasarkan pada blocker yang ditugaskan (1–4) + acceptance gate docs/25. Verifikasi ulang lengkap terhadap inventory P0/P1 produksi belum memungkinkan.

## 10. Remaining P1

Tidak ada blocker gameplay **mutation-path** P1 yang tersisa dalam ruang lingkup ini (join/validasi/guard/admin berfungsi & teruji). Item berikut belum diverifikasi/dieksekusi dan karenanya menahan `BETA_READY=YES`:

- Failover/fallback AI-outage & image-failure (docs/25 #6–#7) belum memiliki test end-to-end verifikasi.
- Path moderation/report (docs/25 #8) belum diverifikasi di jalur nyata.
- Verifikasi deployment Firestore index + audit function count (docs/25 #10–#11).

## 11. Remaining P2/P3

- `rejectCandidate` / `regenerateCase` (pipeline AI real-time) — dikunci sebagai **manual operation** untuk beta (dokumentasi, bukan implementasi).
- `cron.ts` (cleanExpiredIdempotency / archiveInactive) — opsional, belum diimplementasikan untuk closed beta.
- Admin verifikasi role via Firestore — diganti pola token + audit (sesuai definisi blocker 4); dapat diperketat kemudian.
- Callback_query inline-keyboard → belum di-route; seluruh permainan saat ini berbasis command (P2).

---

## Verdict

Blocker 1–4 tuntas dan teruji (225 pass, typecheck clean, `/join` multi-player ter-wire end-to-end dengan transaction + idempotency). Namun **seluruh P0/P1 belum dapat dinyatakan selesai** (P0/P1 deployment/ops di §9, fallback & moderation serta verifikasi Firestore-index di §10 masih menahan). Sesuai instruksi — jangan nyatakan YES jika salah satu P0/P1 belum tuntas — maka:

**`BETA_READY = NO`**