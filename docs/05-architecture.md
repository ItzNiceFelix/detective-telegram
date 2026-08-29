# 05 — Technical Architecture

## 5.1 High-level

```text
Telegram
   |
   | webhook
   v
Vercel Serverless
   |
   +-- Bot Controller
   +-- Command Router
   +-- Callback Router
   +-- Game Engine
   +-- Case Engine
   +-- State Machine / Transition Guard
   +-- Idempotency Service
   +-- Player Engine
   +-- Group Engine
   +-- Scoring Engine
   +-- Achievement Engine
   +-- AI Gateway
   +-- Notification Service
   +-- Analytics/Event Service
   |
   v
Repository Layer
   |
   v
Firebase / Firestore
```

Media dapat memakai storage object provider yang kompatibel dengan arsitektur provider abstraction. Provider tidak boleh di-hardcode ke game engine.

## 5.2 Core architectural rules

### Rule 1 — Deterministic truth

Game truth berasal dari case/session state.

### Rule 2 — Event-driven side effects

Aksi gameplay menghasilkan domain events.

### Rule 3 — Provider abstraction

Telegram, AI text, AI image, dan persistence diakses melalui interface/service layer.

### Rule 4 — Versioned schema

Case dan event schema harus versioned sejak awal.

### Rule 5 — Idempotent writes

Webhook dan callback dapat datang ulang. Semua command kritis harus aman terhadap duplicate delivery.

## 5.3 Suggested logical modules

```text
bot/
game/
cases/
ai/
players/
groups/
achievements/
leaderboard/
notifications/
analytics/
database/
security/
config/
miniapp/
```

## 5.4 Request flow

```text
Telegram Update
 -> authenticate/validate
 -> deduplicate update
 -> identify chat/user
 -> load session
 -> command/callback handler
 -> game engine
 -> persist state + events
 -> render response
 -> Telegram API
```

## 5.5 Recovery

Jika Vercel function gagal setelah state mutation, retry tidak boleh menggandakan:

- score;
- XP;
- evidence;
- accusation;
- achievement.

Gunakan idempotency key / processed-event marker.

## 5.6 Caching

Data case yang immutable dapat dicache secara agresif.

Session state tetap authoritative di database.

## 5.7 Scheduler constraint

Fitur daily/weekly event tidak boleh bergantung pada cron per-menit. Scheduler harus memiliki adapter yang dapat diganti, dan reminder dapat menggunakan lazy evaluation pada interaction berikutnya atau provider scheduler terpisah bila diperlukan.

## 5.8 Locked domain boundaries

`CaseEngine` bertanggung jawab terhadap immutable CaseVersion dan validation pipeline. `GameEngine` hanya memutasi CaseSession yang valid. `AI Gateway` tidak memiliki hak untuk menulis canonical truth.

Critical mutation flow:

```text
Telegram Update
 -> auth / access check
 -> idempotency check
 -> transaction
 -> state + domain event
 -> commit
 -> response rendering
```

Side effects seperti XP, achievement, dan analytics mengikuti domain events dan tidak boleh menentukan canonical game truth.
