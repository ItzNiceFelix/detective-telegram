# 26 — Coding Baseline

## Status
**LOCKED — SOURCE OF TRUTH FOR IMPLEMENTATION**

This document consolidates the project decisions made during review. Implementation should treat this baseline, the referenced domain contracts, and the repository TypeScript types/tests as authoritative.

## 26.1 Product boundary

Closed beta:
- one Telegram group;
- up to 30 group members;
- max 6 active detectives per case session;
- one non-terminal session per group;
- spectators can read shared gameplay output but cannot mutate gameplay.

Default mode:
- cooperative detective agency;
- shared evidence/timeline/dialogue knowledge;
- individual contribution attribution.

Public/open-beta expansion is architecture-ready but not required for closed-beta release.

## 26.2 Domain hierarchy

```text
Case
  └── CaseVersion (immutable published snapshot)
        └── CaseSession (mutable runtime instance)
```

Rules:
1. A session always references a specific immutable `CaseVersion`.
2. Published `CaseVersion` is never edited in place.
3. A corrected case creates a new version.
4. Replay creates a new `CaseSession` against the same `CaseVersion`.

## 26.3 Runtime session state

Persisted state:

```ts
type SessionState = 'LOBBY' | 'OPEN' | 'PAUSED' | 'CLEARED' | 'ARCHIVED';

type SessionOutcome =
  | 'SOLVED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'ABANDONED'
  | 'EXCEPTIONAL';
```

Derived status:

```ts
type EffectiveStatus =
  | 'LOBBY'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'COLD'
  | 'PAUSED'
  | 'CLEARED'
  | 'ARCHIVED';
```

`INACTIVE` and `COLD` are calculated from `lastActivityAt`; they are not persisted lifecycle states.

## 26.4 Runtime authority

```text
Telegram / Mini App
        ↓
Application Service
        ↓
Game Engine (authority)
        ↓
Firestore transaction
        ↓
Commit
        ↓
Domain Events
        ↓
Side Effects / Rendering
```

Authority rules:
- client never writes canonical game state;
- AI never writes canonical game state;
- scoring engine decides score;
- dialogue engine decides semantic response;
- AI only renders approved semantics;
- CaseVersion is the canonical content source.

## 26.5 Allowed gameplay actions

```text
Investigate
Inspect
Interrogate
Confront
View Evidence
View Timeline
Create/Update Theory
Request Hint
Propose Accusation
Vote Accusation
Finalize Accusation
Pause
Resume
```

Every mutation is checked against:
- session state;
- actor authorization;
- target validity;
- CaseVersion membership;
- prerequisites;
- idempotency;
- rate policy.

## 26.6 Shared-state rule

In cooperative mode, investigation and discovered information are shared.

Shared:
- discovered evidence;
- examined objects;
- unlocked dialogue;
- known statements/contradictions;
- discovered timeline facts;
- team theories;
- accusation proposal;
- final resolution;
- team score.

Personal attribution:
- first-discovery credit;
- meaningful action credit;
- hints used;
- individual contribution score;
- career XP/statistics.

## 26.7 Accusation contract

At most one active proposal exists per session.

```text
PROPOSED → QUALIFIED → FINAL → RESOLVED
        \→ WITHDRAWN
```

Qualification uses strict majority of active detectives.

Final accusation is irreversible and occurs once per session. A wrong final accusation ends the session as `CLEARED + FAILED`.

All finalization and score mutations are transactional.

## 26.8 Evidence contract

```text
Inspectable Object
      ↓
Observation
      ↓
Evidence
      ↓
Inference
      ↓
Theory
```

Evidence discovery state:

```text
HIDDEN → DISCOVERED → EXAMINED
```

`truthStatus` and `relevance` remain independent. Red herrings are not synonymous with false evidence.

## 26.9 Timeline/proof contract

A case contains:
- canonical timeline;
- causal graph;
- proof graph;
- explicit required/supporting evidence;
- one canonical solution for v1.

The validator must prove:
- solution reachable;
- solution discoverable;
- exactly one valid solution;
- no permanent dead-end introduced by legal actions.

## 26.10 Interrogation contract

```text
Player text
  ↓
Intent extraction
  ↓
Dialogue Engine
  ↓
Semantic Response Packet
  ↓
AI Renderer
  ↓
Response validation
  ↓
Telegram
```

AI can alter wording/tone only. It cannot create facts, evidence, unlocks, score, or state transitions.

## 26.11 AI generation contract

Build-time pipeline:

```text
Seed
→ Truth Builder
→ Timeline/Causality
→ Evidence/Proof
→ Dialogue Semantics
→ Narrative
→ Visual Plan
→ Image Generation
→ Asset QA
→ Validators
→ Solver/Uniqueness
→ Safety
→ Publish
```

Failed validation blocks publication.

Runtime AI receives only the minimum allowed context and has no game-state write authority.

## 26.12 Firestore contract

Primary collections:

```text
users/
groups/
cases/
case_sessions/
case_events/
player_stats/
group_stats/
achievements/
leaderboards/
feature_flags/
moderation_cases/
reports/
```

Bounded aggregate rule:
- do not append unbounded transcript/media/event arrays to `case_sessions`;
- use subcollections or separate collections for bounded historical records;
- query indexes are created only for real application queries.

Transactions:
- use for critical compare-and-set mutations;
- never call AI/Telegram/external provider inside transaction;
- event + state commit is canonical;
- post-commit effects may retry independently.

## 26.13 Idempotency

Update-level idempotency:
- Telegram `update_id`.

Action-level idempotency:
- `callback_query.id` or generated action ID.

Critical operations are safe to retry:
- evidence discovery;
- hint use;
- theory mutation;
- contribution award;
- accusation proposal/vote/finalization;
- resolution.

## 26.14 Vercel function budget

Hard engineering ceiling: **12 deployed function entrypoints**.

Target:

```text
/api/telegram.ts
/api/admin.ts
/api/cron.ts
/api/health.ts
```

No feature may create a new function entrypoint without explicit review.

All business logic belongs outside `/api`.

## 26.15 Free-tier posture

The closed beta must not depend on:
- frequent cron scheduling;
- Firebase Cloud Functions;
- persistent queue infrastructure;
- per-interaction image generation;
- full Telegram chat archival.

AI/image generation is primarily an offline/admin build process. Runtime AI is bounded to narrow assistant/dialogue rendering cases.

## 26.16 Telegram UX

Primary UI:
- group chat;
- inline keyboards;
- compact callbacks;
- meaningful message events;
- optional Mini App for board/timeline/statistics.

Callback payloads are untrusted and contain references, not canonical truth.

Mini App uses the same application services and authorization checks as Telegram.

## 26.17 Security/safety baseline

Required:
- webhook authenticity validation;
- server-side authorization;
- callback target validation;
- rate limiting;
- anti-replay/idempotency;
- fictional-case default;
- moderation hooks for generated content;
- report/disable controls;
- no real-world accusation gameplay;
- secrets outside repository.

## 26.18 Observability

Log structured events with correlation IDs.

Required metrics:
- updates/actions;
- rejects;
- transaction conflicts;
- starts/completions;
- hints/accusations;
- solves/fails;
- AI calls/failures;
- image jobs/failures;
- Telegram sends/failures;
- quota/usage signals where available.

## 26.19 Test gates

Before beta:
- 20+ validated cases;
- state-machine tests;
- proof/solver/uniqueness tests;
- duplicate delivery tests;
- concurrency tests;
- AI/image failure tests;
- moderation/report tests;
- end-to-end full-case test;
- deployment function-count audit;
- rollback drill;
- no P0/P1 gameplay defects.

## 26.20 Definition of done

A fresh beta group can:

```text
/add bot
→ create/start lobby
→ join up to 6 detectives
→ investigate
→ inspect
→ interrogate
→ confront
→ build theory
→ vote/propose accusation
→ resolve
→ view score/profile
→ archive
→ replay an eligible case
```

without code/admin intervention beyond intentionally retained beta moderation/operations controls.

## 26.21 Non-goals for coding baseline

Do not add before beta unless a blocker is discovered:
- multi-group simultaneous session orchestration beyond the existing data model;
- real-time generated image per action;
- unrestricted AI chat;
- user-generated public case marketplace;
- real-money mechanics;
- social feed/network;
- persistent raw chat archive.
