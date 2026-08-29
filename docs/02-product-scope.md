# 02 — Product Scope & Closed Beta

> **UPDATE (revisi closed beta):** Scope beta diubah dari *open beta publik* menjadi
> *closed beta single-group*. Lihat 2.0 untuk detail. Bagian 2.1–2.4 di bawah tetap
> berlaku sebagai target fitur, hanya beroperasi pada skala yang jauh lebih kecil.

## 2.0 Closed Beta — Single Group Scope (BARU)

Beta pertama **tidak** dibuka ke publik. Target:

- **1 grup Telegram** sebagai lingkup beta (30 member).
- **Maksimal 6 player aktif** per case (roleplay "detective team").
- **Maksimal 1 case session aktif per grup** — tidak ada paralel case dalam satu grup.
- Member grup di luar 6 player (disebut **spectator**) **tidak dapat berinteraksi**
  dengan inline button case, tapi **tetap dapat membaca** seluruh pesan/progress case
  di grup (briefing, evidence, reveal, dsb dikirim sebagai pesan grup biasa, bukan
  private message ke player saja).
- Join sebagai player dilakukan lewat inline button "Join Investigation" di pesan
  lobby; setelah slot 6 terisi atau lobi ditutup, tombol join dinonaktifkan.

### 2.0.1 Access control pada callback

Setiap callback query (tombol inline) untuk aksi gameplay (`Investigate`, `Suspects`,
`Evidence`, `Timeline`, `Hint`, `Accuse`, `Pause`, `Resume`) **wajib divalidasi**:

```text
if callback.userId not in session.playerIds:
    answerCallbackQuery(alert="Kamu bukan bagian dari tim investigasi ini.")
    return
```

Spectator yang menekan tombol mendapat alert singkat (silent, tidak mengubah state),
bukan error yang membingungkan.

### 2.0.2 Single active session per group

`groups/{groupId}.activeCaseSessionId` adalah **satu-satunya** pointer sesi aktif.
Command "start new case" ditolak selama field ini terisi dengan session berstatus
`OPEN` atau `OPEN_PENDING` (lihat 03 — Gameplay untuk detail status).
Pengecualian: jika session berstatus `COLD_CASE`, grup boleh memilih untuk tetap
melanjutkan case lama tersebut, atau (opsional, lihat Open Questions) memulai case
baru sambil case lama tetap tercatat sebagai backlog cold case.

## 2.1 Target public/open-beta feature set

### Core gameplay

- Case lobby
- Case briefing
- Crime scene image
- Multi-scene investigation
- Inspectable objects
- Evidence collection
- Suspect directory
- Witnesses
- Interrogation tree
- Present evidence / confrontation
- Timeline
- Hints
- Theory / deduction
- Final accusation
- Resolution & case reveal
- Score
- XP
- Achievements
- Case difficulty

### Multiplayer

- Cooperative group mode
- Competitive scoring mode
- Per-group case session
- Per-player contribution tracking
- Group leaderboard
- Individual leaderboard
- Group detective agency profile

### AI

- Case generation
- Case Bible generation
- Logical consistency validation
- Narrative generation
- Suspect/dialogue generation
- Visual prompt generation
- Crime scene image generation
- AI detective assistant (bounded by case state)

### Platform

- Telegram webhook
- Inline keyboards
- Deep links
- Role/admin checks
- Rate limits
- Session recovery
- Idempotency
- Error handling
- Logging
- Feature flags
- Analytics

### Safety

- Fictional cases by default
- Content moderation for generated cases
- Creator moderation hooks
- User report
- Case disable/rollback
- Spam protection
- Abuse controls

### Optional but architecture-ready

- Telegram Mini App detective board
- Community cases
- Seasons
- Special events
- Premium entitlements

## 2.2 Explicitly out of scope for initial open beta

- Real-world murder accusations.
- Real person profiling.
- User-uploaded faces used as suspects by default.
- Real-money gambling.
- AI that decides game truth dynamically during live gameplay.
- Unlimited real-time image generation for every player action.
- Persistent storage of all group chat messages.
- Full social network inside the bot.

## 2.3 Definition of a shippable case

Sebuah case siap dipublish ketika:

- schema valid;
- Case Bible valid;
- semua suspect reference valid;
- semua evidence reference valid;
- solution reachable;
- red herrings tidak membuat solusi menjadi mustahil;
- timeline konsisten;
- visual asset tersedia;
- clue metadata tersedia;
- safety checks lolos;
- fallback text tersedia apabila image gagal dikirim.

## 2.4 Product modes

### Cooperative

Satu grup melawan kasus. **Mode default dan satu-satunya mode untuk closed beta**
(maks 6 player, 1 session per grup).

### Competitive

Semua pemain mendapat score pribadi berdasarkan kontribusi dan akurasi. Tetap berjalan
di dalam 1 session cooperative yang sama — competitive di sini berarti *scoring per
individu di dalam tim*, bukan mode terpisah. Ditunda untuk fase setelah closed beta.

### Solo

Gameplay dapat berjalan di private chat. **Di luar scope closed beta** (closed beta
fokus pada 1 grup, 6 player).

### Replay

Case yang telah `CLEARED` (solved) dapat dimainkan kembali oleh grup lain dengan score
baru — bukan grup yang sama, karena kebenaran solusi sudah diketahui grup tersebut.
Case yang masih `COLD_CASE`/belum solved dapat **dilanjutkan** (bukan diulang dari nol)
oleh grup yang sama kapan saja — lihat 03 — Gameplay, bagian status case.
