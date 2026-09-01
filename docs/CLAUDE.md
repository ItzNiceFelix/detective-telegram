# Detective Telegram — Claude Implementation Guide

## Tujuan

Kamu adalah implementation agent untuk project Detective Telegram.

Repository, specification, dan architecture contract tersedia di repository ini.

Tujuanmu adalah mengimplementasikan specification yang sudah dikunci tanpa melakukan redesign arsitektur secara sepihak.

## Source of Truth

Prioritas:

1. `docs/26-coding-baseline.md`
2. `docs/27-final-audit.md`
3. `docs/19-decision-log.md`
4. `docs/18-domain-contracts.md`
5. contract/domain documents lainnya di `docs/`
6. `docs/IMPLEMENTATION-MAP.md`
7. existing code

Jika terdapat konflik, jangan membuat keputusan sendiri. Ikuti prioritas di atas.

## Coding Language

Source code internal menggunakan Bahasa Indonesia.

Gunakan contoh:

`mulaiSesiKasus()`
`ambilSesiAktifGrup()`
`temukanBukti()`
`periksaObjek()`
`interogasiTersangka()`
`ajukanTuduhan()`

Variabel:

`sesiKasus`
`versiKasus`
`idGrup`
`idPemain`
`daftarBukti`

Class internal:

`MesinPermainan`
`LayananInvestigasi`
`RepositoriSesiKasus`

Technical/external terminology tetap menggunakan nama aslinya:

Telegram
Firestore
Firebase
Vercel
HTTP
JSON
API
SDK
Promise
Webhook

## Architecture

Modular monolith / serverless.

Maximum Vercel functions: 12.

Target functions:

`/api/telegram.ts`
`/api/admin.ts`
`/api/cron.ts`
`/api/health.ts`

Jangan membuat endpoint baru untuk feature baru.

## Domain Authority

`CaseVersion` = canonical truth.

`CaseSession` = runtime mutable state.

Game Engine = authority.

AI bukan authority.

## AI

AI hanya boleh menghasilkan atau merender content yang telah ditentukan oleh deterministic game/domain layer.

AI tidak boleh menentukan:

* culprit
* truth
* score
* unlock
* state transition
* evidence validity
* final accusation result

## Persistence

Firestore transaction digunakan untuk critical mutation.

Jangan melakukan external API call di dalam transaction.

Critical mutation harus idempotent.

## Multiplayer

Default mode cooperative.

Investigation result shared.

Evidence shared.

Timeline knowledge shared.

Interrogation result shared.

Discovery credit personal.

## Development Method

Implementasi dilakukan berdasarkan milestone.

Untuk setiap milestone:

1. baca specification relevan,
2. inspect existing implementation,
3. implement scope,
4. test,
5. type-check,
6. self-review,
7. security/concurrency review,
8. tampilkan summary,
9. jangan melanjutkan milestone berikutnya tanpa instruksi.

## Scope Discipline

Jangan:

* menambah feature baru,
* mengubah locked contract,
* membuat API endpoint baru,
* membuat abstraction tanpa kebutuhan,
* melakukan rewrite massal,
* mengganti dependency tanpa alasan.

Jika implementation membutuhkan perubahan terhadap locked contract, STOP dan laporkan.

## Quality Gate

Sebelum menyatakan milestone selesai:

* TypeScript compile harus bersih.
* Test harus lulus.
* Tidak ada `any` baru tanpa alasan.
* Tidak ada secret di source.
* Tidak ada business logic di Telegram handler.
* Tidak ada business logic di Firestore adapter.
* Tidak ada AI call dalam Firestore transaction.
* Tidak ada Telegram call dalam Firestore transaction.
* Tidak ada duplicate reward akibat retry.
* Tidak ada mutation dari spectator.
* Semua state transition mengikuti specification.

## Git

Jangan force push.

Jangan menghapus history.

Jangan melakukan destructive git command.

Setiap milestone harus menghasilkan commit yang terisolasi.

## Communication

Sebelum implementasi, berikan:

* scope,
* file yang akan disentuh,
* risiko,
* test plan.

Setelah implementasi, berikan:

* file berubah,
* behavior,
* tests,
* known limitations,
* specification compliance.

Jika menemukan issue di luar scope, jangan memperbaikinya diam-diam. Laporkan.

## Important

Jangan menganggap "lebih bagus" berarti boleh mengubah architecture.

Compatibility terhadap specification lebih penting daripada elegance.
