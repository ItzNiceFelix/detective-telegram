# Detective Telegram — Copilot Coding Constitution

## 1. PROJECT

Project ini adalah **Detective Telegram**, multiplayer cooperative detective game untuk Telegram Group.

Project specification berada langsung di folder:

`docs/`

Jangan mencari `docs/specification/`.

## 2. SPECIFICATION PRIORITY

Baca dan prioritaskan:

1. `docs/26-coding-baseline.md`
2. `docs/27-final-audit.md`
3. `docs/19-decision-log.md`
4. seluruh domain dan contract documents lainnya di `docs/`
5. kode yang sudah ada
6. asumsi pribadi

Jika terjadi conflict, specification dengan prioritas lebih tinggi menang.

Jangan mengubah locked decision hanya untuk mempermudah implementation.

## 3. LANGUAGE & NAMING

Source code internal menggunakan Bahasa Indonesia.

Gunakan naming yang natural dan mudah dipahami programmer Indonesia.

Contoh fungsi:

```ts
mulaiSesiKasus()
ambilSesiKasus()
simpanSesiKasus()
validasiTransisiSesi()
temukanBukti()
periksaObjek()
interogasiTersangka()
ajukanTeori()
ajukanTuduhan()
hitungSkor()
catatAcara()
```

Contoh variabel:

```ts
sesiKasus
versiKasus
idGrup
idPemain
daftarBukti
statusSesi
waktuAktivitasTerakhir
```

Contoh class:

```ts
MesinPermainan
LayananKasus
LayananBukti
LayananInterogasi
RepositoriSesiKasus
PengelolaAcaraDomain
```

Boolean:

```ts
apakahSesiAktif
sudahDitemukan
bolehMelakukan
memilikiAkses
```

Jangan menggunakan generic naming seperti:

```ts
doThing()
processData()
handleStuff()
utils.ts
helpers.ts
common.ts
```

## 4. EXTERNAL TERMINOLOGY

Jangan menerjemahkan nama kontrak eksternal.

Tetap gunakan:

* Telegram
* Firestore
* Firebase
* Vercel
* TypeScript
* JavaScript
* HTTP
* JSON
* API
* SDK
* webhook
* Promise
* URL

Nama internal domain tetap Bahasa Indonesia.

## 5. COMMENTS

Komentar menggunakan Bahasa Indonesia.

Komentar menjelaskan alasan atau constraint penting, bukan mengulang kode.

Jangan membuat komentar panjang yang tidak diperlukan.

## 6. ARCHITECTURE

Project menggunakan modular monolith / serverless architecture.

Vercel absolute function ceiling:

12

Target production functions:

4

Entrypoint:

```text
/api/telegram.ts
/api/admin.ts
/api/cron.ts
/api/health.ts
```

Jangan membuat API entrypoint baru untuk setiap feature.

Business logic wajib berada di `src/`.

## 7. DOMAIN AUTHORITY

`CaseVersion` adalah canonical truth.

`CaseSession` adalah mutable runtime state.

Game Engine adalah authority untuk:

* validasi action
* state transition
* investigation
* evidence
* interrogation
* timeline
* proof
* theory evaluation
* accusation
* scoring
* resolution

AI bukan source of truth.

## 8. AI BOUNDARY

AI hanya boleh:

* menghasilkan case content berdasarkan schema
* merender dialogue
* menghasilkan visual prompt
* menghasilkan image
* membantu reasoning dari canonical facts yang diberikan

AI tidak boleh:

* menentukan culprit
* mengubah canonical timeline
* menciptakan gameplay evidence ketika runtime
* memberikan score
* membuka node secara bebas
* menentukan accusation result

## 9. SESSION STATE

Persisted state:

```text
LOBBY
OPEN
PAUSED
CLEARED
ARCHIVED
```

`INACTIVE` dan `COLD` adalah derived status.

Gameplay mutation hanya valid pada `OPEN`.

## 10. MULTIPLAYER

Default mode adalah cooperative.

Investigation state shared.

Evidence shared.

Interrogation result shared.

Timeline knowledge shared.

Theory shared.

Discovery credit personal.

Spectator tidak boleh melakukan gameplay mutation.

## 11. EVIDENCE

Inspectable Object bukan otomatis evidence.

Observation adalah fakta yang diamati.

Evidence berasal dari CaseVersion.

Evidence:

* dapat memiliki truth status
* dapat memiliki relevance
* dapat memiliki relationship
* dapat menjadi bagian proof graph

Red herring tidak sama dengan false evidence.

## 12. INTERROGATION

Interrogation menggunakan hybrid architecture:

```text
player input
→ intent
→ deterministic game engine
→ semantic response
→ AI narrative renderer
```

AI tidak boleh menciptakan canonical facts.

## 13. TIMELINE

Timeline adalah canonical event graph.

Proof Graph menentukan bagaimana solution dibuktikan.

v1 hanya memiliki satu canonical solution.

Case harus solvable dan solution harus unik.

## 14. FIRESTORE

`CaseVersion` immutable setelah publish.

`CaseSession` mutable aggregate.

Critical mutations menggunakan Firestore transaction.

Tidak boleh ada external API call di dalam transaction.

Critical action harus idempotent.

Duplicate Telegram delivery tidak boleh menggandakan:

* progress
* reward
* score
* XP
* evidence
* accusation

## 15. EVENTS

Gunakan domain events untuk side effects:

* XP
* achievements
* analytics
* notification

Event consumer tidak boleh menjadi authority untuk canonical game state.

## 16. TRANSACTION SAFETY

Jangan:

```text
Firestore transaction
    ↓
AI call
    ↓
Telegram call
```

Yang benar:

```text
validate
→ transaction
→ commit
→ side effects
```

## 17. VERCEL

Jangan membuat banyak serverless entrypoint.

Target hanya empat:

```text
telegram
admin
cron
health
```

Semua feature tetap berupa module internal.

## 18. FREE-TIER

Target deployment harus hemat:

* Firestore reads
* Firestore writes
* document size
* Telegram API calls
* AI requests
* unnecessary polling

Jangan menyimpan transcript atau history besar tanpa kebutuhan domain.

## 19. SECURITY

Jangan pernah mengirim ke user:

* secret
* token
* credentials
* internal prompts
* stack trace
* private data pemain lain

Validasi authorization sebelum gameplay mutation.

Callback Telegram harus divalidasi.

User input adalah untrusted input.

## 20. ERROR HANDLING

Gunakan typed/structured domain errors.

User-facing error harus aman dan sederhana.

Internal logs harus cukup untuk debugging.

AI failure tidak boleh merusak canonical game state.

## 21. TESTING

Setiap domain feature harus memiliki test.

Prioritaskan test untuk:

* state transition
* concurrency
* idempotency
* evidence discovery
* interrogation
* proof graph
* accusation
* scoring
* authorization

## 22. IMPLEMENTATION PROCESS

Sebelum coding feature:

1. baca contract terkait
2. identifikasi domain
3. identifikasi state yang berubah
4. identifikasi read/write
5. tentukan transaction boundary
6. tentukan events
7. identifikasi concurrency risk
8. buat tests
9. implement
10. review terhadap specification

Jangan mengimplementasikan banyak domain sekaligus.

## 23. NO UNAUTHORIZED DESIGN CHANGE

Jangan memperkenalkan:

* fitur baru
* state baru
* database strategy baru
* API endpoint baru
* AI authority
* architectural pattern baru

tanpa alasan dan tanpa mencatat perubahan.

Jika specification tidak jelas, gunakan solusi paling konservatif yang menjaga locked contracts.

## 24. CODE QUALITY

Kode harus:

* type-safe
* modular
* testable
* readable
* maintainable
* domain-oriented

Hindari `any`.

Hindari circular dependency.

Hindari business logic di HTTP/Telegram handler.

## 25. FINAL GOAL

Codebase harus dapat dibaca ulang dengan mudah oleh developer Indonesia.

Nama internal harus menggunakan Bahasa Indonesia yang jelas.

Architecture harus tetap sesuai specification.

Correctness dan domain integrity lebih penting daripada kecepatan membuat feature.
