# Detective Telegram — Project Proposal

Dokumen ini adalah pengajuan proyek untuk sebuah **multiplayer detective game native Telegram**.

## Tujuan dokumen

Proposal ini sengaja ditulis untuk tahap **feasibility review**. Fokusnya bukan memulai implementasi, melainkan menjawab:

> Apakah produk ini cukup menarik, cukup realistis secara teknis, dan cukup aman untuk dibangun menuju open beta?

## Ringkasan produk

Detective Telegram memungkinkan sebuah grup Telegram memainkan misteri kriminal fiksi secara kolaboratif. Bot mengirim briefing, crime-scene image, suspect profiles, evidence, interrogation, timeline, hint, dan final accusation. AI digunakan untuk membuat konten kasus dan materi visual, tetapi **Case Bible + Game Engine** tetap menjadi sumber kebenaran deterministik.

## Dokumen

- [01 — Executive Summary](docs/01-executive-summary.md)
- [02 — Product Scope & Open Beta](docs/02-product-scope.md)
- [03 — Gameplay & Game Mechanics](docs/03-gameplay.md)
- [04 — AI & Case Generation](docs/04-ai-pipeline.md)
- [05 — Technical Architecture](docs/05-architecture.md)
- [06 — Data Model & Firebase](docs/06-data-model.md)
- [07 — Telegram UX & Mini App](docs/07-telegram-ux.md)
- [08 — Moderation, Safety & Abuse Prevention](docs/08-safety.md)
- [09 — Free-Tier & Cost Strategy](docs/09-free-tier.md)
- [10 — Analytics & Product Metrics](docs/10-analytics.md)
- [11 — Project Structure](docs/11-project-structure.md)
- [12 — Delivery Plan](docs/12-delivery-plan.md)
- [13 — Risks & Feasibility](docs/13-risks.md)
- [14 — Open Questions / Decisions](docs/14-open-questions.md)
- [15 — Case Bible Schema & Content Contract](docs/15-case-bible-schema.md)
- [16 — Player / Group / Contribution / Scoring Contract](docs/16-player-group-scoring.md)

## Status

**Coding Baseline — Closed Beta Locked / Public Open-Beta Target Defined**

### Changelog revisi closed beta

- Scope diubah dari open beta publik → **closed beta 1 grup** (30 member, maks 6
  player aktif per case, 1 session aktif per grup). Lihat `docs/02-product-scope.md`.
- Access control: hanya player terdaftar (`playerIds`) yang dapat menekan inline
  button gameplay; spectator tetap dapat membaca seluruh progress di grup.
- Session lifecycle dikunci menjadi `LOBBY`, `OPEN`, `PAUSED`, `CLEARED`, `ARCHIVED`;
  `INACTIVE` dan `COLD` adalah derived status. Outcome/resolution dipisahkan dari
  lifecycle state. Lihat `docs/03-gameplay.md` 3.2.
- Ditambahkan mekanisme **Pause/Resume** manual oleh player (tombol inline),
  terpisah dari inactivity otomatis.
- Ditambahkan **daftar unsolved case** (`/cases`) menampilkan status dan lama hari
  case belum terselesaikan.
- Difficulty diubah menjadi **Star Rating (⭐1–5)**, dihitung otomatis & deterministik
  saat case digenerate, tidak dapat dipilih pemain, dan disembunyikan sebelum case
  dimulai. Lihat `docs/03-gameplay.md` 3.12.
- Data model `case_sessions` dan `cases` diperbarui untuk mendukung field-field baru
  di atas. Lihat `docs/06-data-model.md`.
- Analisa kelayakan free-tier diperbarui untuk skala closed beta ini — jauh lebih
  ringan dibanding open beta publik. Lihat `docs/09-free-tier.md` 9.8.

Tidak ada asumsi bahwa seluruh fitur harus aktif pada hari pertama. Namun kontrak inti dirancang sejak awal agar implementasi tidak membutuhkan refactor arsitektur besar ketika fitur open-beta diaktifkan.


### Locked design baseline

Review hingga saat ini telah mengunci:

- `Case -> CaseVersion -> CaseSession`;
- session state lifecycle dan derived inactivity/cold status;
- shared cooperative investigation + personal contribution credit;
- deterministic gameplay truth;
- Evidence/Observation/Statement/Contradiction separation;
- Timeline/Causality + Proof Graph;
- hybrid interrogation (deterministic semantic response + AI rendering);
- immutable Case Bible contract dan validation gates;
- shared multiplayer state + individual contribution credit;
- cooperative accusation proposal + one final accusation;
- bounded scoring, idempotent rewards, dan concurrency-safe progression.

Detail schema ada di `docs/15-case-bible-schema.md`.


## Current Lock Status

The proposal progressed through v7 and is now consolidated into the coding baseline in v8.

New locked areas include:

- Firestore persistence boundaries and bounded `CaseSession` aggregate;
- transactional mutation and concurrency rules;
- idempotency and duplicate-delivery handling;
- post-commit event-driven side effects;
- event retention and indexing strategy;
- server-side mutation authority;
- cross-domain ownership map and dependency rules.

Next review target: the **AI Case Generation & Validation Contract**, including the exact Case Bible schema, generator stages, validator invariants, asset manifest, regeneration policy, and publish gate.


## Current locked baseline

The proposal now locks the full chain from CaseVersion truth through runtime gameplay and AI content generation. See `docs/20-ai-generation-validation-contract.md` for the latest AI/build-time contract.

## Current Lock Status — v8

The project has now locked the runtime/persistence boundary and the free-tier deployment posture.

Key constraint: the implementation must remain within a **12-function Vercel ceiling**, with an initial target of 4 deployed function entrypoints. Business logic is modularized outside the route tree so feature growth does not create serverless function sprawl.

The product baseline, gameplay domain, evidence model, case generation/validation model, player/group/scoring model, persistence contract, Telegram UX contract, security contract, observability/testing contract, and final closed/open-beta acceptance gates are documented in the `docs/` directory.

## v8 Coding Baseline

Implementation source of truth:
- `docs/26-coding-baseline.md`
- `docs/27-final-audit.md`
- all domain contracts referenced therein.

The project is now considered **ready to enter coding**. New changes that affect locked invariants require an explicit decision-log entry.
