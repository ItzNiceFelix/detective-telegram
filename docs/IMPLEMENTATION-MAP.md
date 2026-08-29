# Peta Implementasi Arsitektur — Detective Telegram

Dokumen ini adalah hasil ingest arsitektur dari specification yang berlaku di `docs/` dan merupakan ringkasan yang harus dipakai sebagai source of truth sebelum implementasi. Semua naming internal menggunakan Bahasa Indonesia. Istilah eksternal seperti Telegram, Firestore, Vercel, AI, API, SDK, webhook, URL, JSON, TypeScript tetap dipertahankan sesuai kontrak eksternal.

## 1. Daftar domain

Domain utama yang muncul dari specification adalah:

- Kasus dan versi kasus
  - `Case`
  - `CaseVersion`
  - `CaseSession`
- Grup dan akses pemain
  - `Grup`
  - `Pengguna`
  - `PemainAktif`
  - `Penonton`
- Investigasi dan bukti
  - `ObjekDapatDiperiksa`
  - `Observasi`
  - `Bukti`
  - `Pernyataan`
  - `Kontradiksi`
  - `Inferensi`
  - `Teori`
- Timeline dan solusi
  - `PeristiwaTimeline`
  - `GrafKausal`
  - `GrafBukti`
  - `SolusiKanonik`
  - `Interogasi`
- Tuduhan dan penilaian
  - `ProposalTuduhan`
  - `TuduhanAkhir`
  - `Skor`
  - `Kontribusi`
  - `XP`
  - `Pencapaian`
- Akses, keamanan, dan moderasi
  - `Autorisasi`
  - `RateLimit`
  - `Moderasi`
  - `Laporan`
- AI dan konten
  - `KasusBibel`
  - `PetaVisual`
  - `RendererNaratif`
  - `GeneratorKonten`
  - `ValidatorKasus`
- Infrastruktur runtime
  - `TelegramAdapter`
  - `FirestoreAdapter`
  - `EventBusDomain`
  - `Idempoten`
  - `Konfigurasi`

## 2. Daftar entity

Entity domain yang dipisahkan dari mutable runtime state adalah:

- `Pengguna`
  - `userId`
  - `telegramUserId`
  - `usernameSnapshot`
  - `language`
  - `createdAt`
  - `lastActiveAt`

- `Grup`
  - `groupId`
  - `telegramChatId`
  - `owner/admin metadata`
  - `status`
  - `activeCaseSessionId`
  - `createdAt`

- `Kasus`
  - `caseId`
  - `status`
  - `version`
  - `title`
  - `tags`
  - `publishedAt`

- `VersiKasus`
  - `caseId`
  - `versionId`
  - `schemaVersion`
  - `contentHash`
  - `metadata`
  - `victim`
  - `suspects`
  - `locations`
  - `scenes`
  - `objects`
  - `visualClues`
  - `evidence`
  - `statements`
  - `contradictions`
  - `timeline`
  - `causalRelations`
  - `proofNodes`
  - `proofEdges`
  - `interrogationGraph`
  - `solution`
  - `scoring`
  - `media`
  - `safety`

- `SesiKasus`
  - `sessionId`
  - `caseId`
  - `caseVersionId`
  - `groupId`
  - `status`
  - `outcome`
  - `playerIds`
  - `currentScene`
  - `discoveredEvidence`
  - `examinedObjects`
  - `unlockedDialogue`
  - `teamTheory`
  - `accusationProposal`
  - `finalAccusation`
  - `score`
  - `startedAt`
  - `updatedAt`
  - `lastActivityAt`

- `Tersangka`
  - `suspectId`
  - `identity`
  - `relationship`
  - `occupation`
  - `motive`
  - `alibi`
  - `secrets`
  - `statements`
  - `contradictions`

- `ObjekDapatDiperiksa`
  - `objectId`
  - `sceneId`
  - `name`
  - `visibility`
  - `interaction`
  - `discoveryRules`

- `Bukti`
  - `evidenceId`
  - `source`
  - `truthStatus`
  - `relevance`
  - `fact`
  - `discoveryRules`
  - `relatedSuspects`
  - `relatedTimelineEvents`

- `Pernyataan`
  - `statementId`
  - `suspectId`
  - `text`
  - `claim`
  - `dialogueNodeId`

- `Kontradiksi`
  - `contradictionId`
  - `statementId`
  - `evidenceId`
  - `severity`

- `PeristiwaTimeline`
  - `eventId`
  - `timestamp`
  - `locationId`
  - `actorIds`
  - `action`
  - `truthStatus`
  - `relatedEvidenceIds`
  - `relatedStatementIds`

- `ProposalTuduhan`
  - `proposalId`
  - `proposedBy`
  - `suspectId`
  - `dimensions`
  - `votes`
  - `status`
  - `createdAt`
  - `qualifiedAt`

- `TuduhanAkhir`
  - `suspectId`
  - `dimensions`
  - `resolvedAt`
  - `outcome`

## 3. Daftar aggregate

Aggregate yang paling penting adalah:

- `Kasus` sebagai family aggregate untuk konten dan versi.
- `VersiKasus` sebagai aggregate immutable canonical truth.
- `SesiKasus` sebagai aggregate runtime mutable.
- `Grup` sebagai aggregate social/session ownership.
- `Pengguna` sebagai aggregate profil dan preferensi akun.
- `LaporanModerasi` sebagai aggregate tindakan keamanan/moderasi.
- `StatistikPemain` sebagai aggregate progres personal.
- `StatistikGrup` sebagai aggregate score dan performa grup.

Aturan penting:
- `CaseVersion` adalah canonical truth.
- `CaseSession` adalah mutable runtime state.
- `CaseSession` tidak mengubah `CaseVersion`.

## 4. Daftar repository

Repository yang masuk akal berdasarkan kontrak persistence dan structure:

- `RepositoriPengguna`
- `RepositoriGrup`
- `RepositoriKasus`
- `RepositoriVersiKasus`
- `RepositoriSesiKasus`
- `RepositoriEventKasus`
- `RepositoriKontribusi`
- `RepositoriStatistikPemain`
- `RepositoriStatistikGrup`
- `RepositoriPencapaian`
- `RepositoriPapanPeringkat`
- `RepositoriCiriFitur`
- `RepositoriModerasi`
- `RepositoriLaporan`

Semua repository harus bekerja pada data yang dibatasi, tidak menyimpan transcript grup, media, atau event tak terbatas di satu dokumen.

## 5. Daftar application service

Application service berperan mengkoordinasikan use case, validasi, transaksi, dan state transition:

- `LayananKasus`
  - memuat CaseVersion
  - menyiapkan briefing dan briefing case
  - memvalidasi kelayakan publish

- `LayananSesiKasus`
  - membuat sesi baru
  - memulai sesi
  - menangguhkan dan melanjutkan sesi
  - mengarsipkan sesi
  - menghitung status efektif

- `LayananInvestigasi`
  - identifikasi object yang dapat diperiksa
  - membuka scene
  - menangkap evidence discovered
  - mengganti state discovered/examined

- `LayananInterogasi`
  - ekstraksi intent dari input pemain
  - validasi prerequisite
  - memanggil dialogue engine
  - memproses semantic response

- `LayananTuduhan`
  - membuat proposal accusation
  - mengecek kuorum
  - finalisasi accusation
  - mengakhiri sesi dengan status `CLEARED`

- `LayananTeori`
  - membuat atau memperbarui teori tim
  - menyusun inferensi dan kontradiksi

- `LayananSkor`
  - menghitung skor kelompok
  - menghitung kontribusi personal
  - memvalidasi idempotensi reward

- `LayananGrup`
  - validasi keanggotaan grup
  - validasi jumlah player aktif
  - memastikan satu sesi aktif per grup

- `LayananPemain`
  - validasi peran detective vs spectator
  - menghitung kontribusi pemain
  - menyusun statistik karier

- `LayananAkses`
  - validasi callback Telegram
  - validasi akses gameplay
  - memeriksa session dan role

## 6. Daftar domain service

Domain service adalah aturan bisnis yang bersifat canonical dan tidak tergantung pada transport layer:

- `MesinPermainan`
  - authority untuk validasi action
  - state transition
  - investigation
  - evidence
  - interrogation
  - timeline
  - proof graph
  - theory evaluation
  - accusation
  - scoring
  - resolution

- `ValidasiKasus`
  - structural validation
  - referential validation
  - temporal validation
  - causal validation
  - evidence validation
  - solvability validation
  - uniqueness validation
  - safety validation

- `MesinSkor`
  - menentukan skor benar/salah
  - mengatur reward berdasarkan contribution
  - menjaga bounded group score

- `MesinDialog`
  - menerima intent dan semantic packet
  - memutuskan node interogasi yang valid
  - menjaga AI sekadar renderer

- `MesinTimeline`
  - validasi urutan peristiwa
  - memeriksa kontradiksi dan hubungan kausal

- `MesinBukti`
  - memeriksa evidence discovery rules
  - mengelola status `HIDDEN -> DISCOVERED -> EXAMINED`
  - memisahkan `truthStatus` dan `relevance`

- `MesinTuduhan`
  - memvalidasi final accusation
  - memastikan satu final accusation per sesi
  - mengevaluasi benar/salah berdasarkan solusi kanonik

## 7. Daftar event

Domain event yang dipersyaratkan sebagai event authoritative untuk side effects dan audit:

- `PLAYER_JOINED`
- `PLAYER_LEFT`
- `EVIDENCE_DISCOVERED`
- `CONTRADICTION_FOUND`
- `CONFRONTATION_SUCCESS`
- `THEORY_UPDATED`
- `HINT_USED`
- `ACCUSATION_PROPOSED`
- `ACCUSATION_QUALIFIED`
- `FINAL_ACCUSATION`
- `CASE_CLEARED`
- `CASE_ARCHIVED`
- `CASE_PUBLISHED`
- `CASE_ROLLED_BACK`
- `CASE_DISABLED`
- `USER_BLOCKED`
- `GROUP_DISABLED`
- `XP_EARNED`
- `ACHIEVEMENT_UNLOCKED`
- `ANALYTICS_EVENT`

Semua event harus immutable. Event consumer tidak boleh menjadi source of truth canonical.

## 8. Daftar external adapter

Adapter eksternal yang harus dipisahkan dari domain logic:

- `TelegramAdapter`
  - webhook validation
  - parsing update
  - callback validation
  - render message, keyboard, inline button
  - deep link / start flow

- `FirestoreAdapter`
  - repository implementation
  - transaction abstraction
  - idempotency marker
  - query dan index access

- `AITextGateway`
  - runtime assistant
  - narrative renderer
  - hint renderer
  - prompt abstraction

- `AIImageGateway`
  - image prompt generation
  - image asset generation
  - provider abstraction

- `ModerationGateway`
  - content safety check
  - case validation gate

- `MediaStorageAdapter`
  - object storage / asset reference
  - bukan Firestore media blobs

- `NotifikasiAdapter`
  - Telegram send after commit
  - reminder / alert

- `AnalitikAdapter`
  - aggregate metric
  - event consumer

## 9. API entrypoint

Target entrypoint yang diizinkan sesuai specification adalah:

- `/api/telegram.ts`
  - webhook Telegram
  - command router
  - callback router

- `/api/admin.ts`
  - operasi admin yang aman
  - moderation, flag, rollback

- `/api/cron.ts`
  - scheduler opsional dengan batasan ringan
  - tidak menjadi dependency logika gameplay utama

- `/api/health.ts`
  - readiness / health

Semua business logic tetap berada di `src/` dan bukan di folder `/api`.

## 10. Dependency direction

Arah dependency yang benar adalah:

```text
Telegram / Mini App
        ↓
Layanan aplikasi / HTTP handler
        ↓
MesinPermainan
        ↓
Layanan domain / validasi / aturan bisnis
        ↓
Repositori / Firestore transaction
        ↓
Commit state + event
        ↓
Side effects (XP, achievement, analytics, Telegram render)
```

AI berada di sisi yang sama dengan output presentasi:

```text
MesinPermainan
        ↓ semantic packet / context terbatas
AI Gateway
        ↓
Narrative / visual renderer
        ↓
Response validation
        ↓
Telegram rendering
```

Aturan utama:
- presentation tidak boleh memengaruhi canonical truth.
- lower-level domain tidak boleh bergantung pada UI / provider SDK.
- repository hanya menyediakan akses data, bukan aturan bisnis.

## 11. Dependency yang dilarang

Dependency yang tidak boleh ada:

- `MesinPermainan` → `Telegram` formatter langsung
- `Game Engine` → `AI` write path to canonical `CaseSession`
- `Game Engine` → `Firestore` transaction yang memanggil AI provider
- `Game Engine` → `Telegram` send API yang berjalan di dalam transaction
- `AI` → `CaseSession` write authority
- `AI` → direct score mutation
- `CaseSession` → per-player shadow copy of evidence tanpa alasan domain
- `Cron` → status mutation permanen yang menggantikan derived status
- `HTTP handler` → business logic langsung tanpa application service
- `CaseVersion` bisa diubah in-place setelah publish
- `Aksi gameplay` yang dipanggil dari client tanpa server-side authorization

## 12. Transaction boundary

Mutation yang mengubah canonical state harus dibatasi dalam transaction atau compare-and-set semantik.

Boundary transaksi yang wajib ada:

- `temukanBukti()`
  - validasi session `OPEN`
  - validasi player aktif
  - validasi object/evidence belum ditemukan
  - mutate `discoveredEvidence` dan `lastActivityAt`
  - tulis event `EVIDENCE_DISCOVERED`

- `ajukanTuduhan()`
  - validasi sesi aktif
  - validasi tidak ada proposal aktif yang tumpang tindih
  - ubah status proposal / vote
  - tulis `ACCUSATION_PROPOSED` atau `ACCUSATION_QUALIFIED`

- `finalisasiTuduhan()`
  - validasi satu final accusation maksimal
  - validasi kuorum
  - evaluasi solusi kanonik
  - set `finalAccusation`
  - set `state = CLEARED`
  - set `outcome`
  - hitung skor final
  - tulis `FINAL_ACCUSATION` dan `CASE_CLEARED`

- `mulaiSesiKasus()` / `gabungPemain()`
  - validasi grup, kuota, status, role
  - satu sesi aktif per grup
  - memperbarui daftar `playerIds`

Aturan penting:
- tidak ada AI call, Telegram send, atau side effect eksternal di dalam callback Firestore transaction.
- semua critical action harus idempotent.
- duplicate delivery Telegram tidak boleh menggandakan score, evidence, accusation, XP, atau progress.

## 13. AI boundary

AI hanya boleh bekerja sesuai batasan berikut:

### Diperbolehkan
- menghasilkan case content berdasarkan schema
- menghasilkan narasi dan dialog dari semantic response yang sudah ditentukan engine
- menghasilkan visual prompt dari visual clue plan
- menghasilkan gambar dari asset plan yang tervalidasi
- membantu reasoning dari fakta kanonik yang sudah diketahui dan diizinkan
- memberi hint terbatas pada state yang player sudah tahu

### Dilarang
- menentukan culprit atau solusi runtime
- mengubah timeline kanonik
- menciptakan evidence baru saat permainan berjalan
- memberi skor atau reward
- membuka node tanpa prerequisite
- menentukan hasil accusation
- menulis canonical game state ke Firestore
- mengganti `CaseVersion` yang sudah publish

### RL / runtime
- AI runtime hanya menerima konteks minimal yang dibolehkan.
- AI harus memiliki fallback deterministic bila gagal.
- AI tidak boleh menjadi sumber kebenaran permainan.

## 14. Telegram boundary

Telegram adalah interface utama, bukan sumber kebenaran.

- Telegram webhook adalah entrypoint masuk.
- Semua action callback harus diverifikasi server-side.
- Setiap callback gameplay harus memeriksa:
  - chat milik session yang benar
  - user adalah detective aktif
  - session status `OPEN`
  - action legal sesuai `CaseVersion`
  - action belum diproses
  - spectator tidak dapat melakukan gameplay mutation

Boundary Telegram:
- message dan keyboard adalah rendering layer
- deep link dan Mini App adalah presentasi
- interaksi user dianggap untrusted input
- Telegram API call setelah commit baru dijalankan; bukan di dalam transaksi

Mode kooperatif default:
- evidence, timeline, theory, dan progress bersama dipakai di `CaseSession`
- kontributor personal dicatat secara terpisah
- spectator berhak membaca shared progress tetapi tidak dapat mutasi gameplay

## 15. Firestore boundary

Firestore adalah persistence layer untuk state game, metadata, event, dan stats. Bukan media warehouse atau transcript chat.

### Koleksi utama

```text
users/
groups/
cases/
cases/{caseId}/versions/{caseVersionId}
case_sessions/
case_sessions/{sessionId}/contributions/{contributionId}
case_sessions/{sessionId}/events/{eventId}
player_stats/
group_stats/
achievements/
leaderboards/
feature_flags/
moderation_cases/
reports/
```

### Batasan penting

- `CaseVersion` immutable setelah publish.
- `CaseSession` adalah aggregate mutasi runtime.
- `case_sessions` harus dibatasi dan tidak menyimpan transcript atau media tidak terbatas.
- `case_events` hanya menyimpan event domain yang ringkas dan dapat dibatasi retensi.
- `groups/{groupId}` memegang pointer ke sesi aktif.
- `playerIds` dibatasi maksimal 6 pada closed beta.
- `lastActivityAt` digunakan untuk menghitung status efektif `ACTIVE`, `INACTIVE`, `COLD` secara lazy.
- `SessionState` yang tersimpan hanya `LOBBY | OPEN | PAUSED | CLEARED | ARCHIVED`.

### Dilarang di Firestore
- one giant session document with full transcript/history
- media blob besar
- chat archive
- incremental score yang tidak disertai gameplay mutation
- AI provider calls inside transaction
- cron-driven rewrites untuk derived status

## Ringkasan keputusan arsitektur yang dikunci

- Canonical truth berasal dari `CaseVersion`, bukan dari AI atau Telegram client.
- `CaseSession` adalah mutable runtime aggregate.
- Semua gameplay mutation hanya valid pada status `OPEN`.
- Final accusation hanya sekali per sesi dan salah final accusation mengakhiri sesi sebagai `CLEARED + FAILED`.
- Shared state untuk cooperative mode termasuk evidence, timeline, theory, dan accusation proposal.
- Personal attribution dipisahkan dari canonical state.
- Event domain dipakai untuk side effects seperti XP, achievement, leaderboard, analytics, dan notifikasi.
- Proyek memakai modular monolith/serverless dengan target 4 function entrypoint dan 12-function ceiling.
- AI hanya rendering dan content generation, bukan authority untuk gameplay truth.
- Telegram hanya interface; akses dan validasi state dilakukan di server.
- Firestore digunakan untuk state kecil dan event ringkas, bukan chat archive atau media warehouse.

## Panduan implementasi selanjutnya

Implementasi berikutnya harus fokus pada domain dan state transition yang terkunci, bukan menambah feature baru. Target pengembangan berikut adalah membangun modul modular sesuai arahan specification, dengan urutan yang aman:

1. struktur repository dan domain model
2. state machine `CaseSession`
3. repositori dan transaction boundary
4. game engine dan validation rules
5. Telegram adapter dan callback authorization
6. event handling dan post-commit side effects
7. AI gateway dengan boundary yang jelas
8. testing untuk idempotency, state transition, dan accusation

Tidak menambah state baru, database strategy baru, API entrypoint baru, atau AI authority yang tidak tercatat dalam locked contract.
