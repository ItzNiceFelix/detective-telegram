# 17 — Persistence & Firestore Contract

## Status

**LOCKED BASELINE** — persistence boundaries, transactional mutation rules, idempotency,
event storage, document ownership, and recovery rules for the closed beta.

## 17.1 Persistence principles

1. Firestore stores **current game state + compact audit events**, not a transcript of the Telegram group.
2. Immutable case content is stored separately from mutable session state.
3. A gameplay mutation and the canonical event that explains it are committed atomically whenever practical.
4. Derived progression such as XP/achievements must never be authoritative for game truth.
5. Large or high-churn arrays must not grow indefinitely inside a single session document.
6. All critical mutations are idempotent.
7. Session reads may reconstruct derived status from timestamps; no cron-driven status mutation is required.

## 17.2 Canonical collection layout

```text
users/{userId}
groups/{groupId}
cases/{caseId}
cases/{caseId}/versions/{caseVersionId}
case_sessions/{sessionId}
case_sessions/{sessionId}/contributions/{contributionId}
case_sessions/{sessionId}/events/{eventId}
player_stats/{userId}
group_stats/{groupId}
achievements/{achievementId}
leaderboards/{boardId}
feature_flags/{flagId}
moderation_cases/{caseId}
reports/{reportId}
```

The `cases/{caseId}/versions/{caseVersionId}` boundary is the canonical content store. A
published version is immutable.

## 17.3 Document ownership

### User

`users/{userId}` owns stable account-level preferences and Telegram identity snapshots.

### Group

`groups/{groupId}` owns Telegram group configuration and the pointer to its current active
session.

### Case / CaseVersion

`Case` identifies a content family. `CaseVersion` is the immutable playable snapshot.

### CaseSession

`CaseSession` is the authoritative mutable aggregate for one actual playthrough.

### Event

`case_sessions/{sessionId}/events/{eventId}` contains immutable domain events for audit,
replay/debugging, analytics, and progression consumers.

### Contribution

`case_sessions/{sessionId}/contributions/{contributionId}` records personal attribution
for reward-bearing progress.

## 17.4 CaseSession document boundary

`CaseSession` should contain only bounded, frequently-read state:

```ts
interface CaseSessionDocument {
  sessionId: string;
  caseId: string;
  caseVersionId: string;
  groupId: string;
  status: "LOBBY" | "OPEN" | "PAUSED" | "CLEARED" | "ARCHIVED";
  outcome: null | "SOLVED" | "FAILED" | "TIMEOUT" | "ABANDONED" | "EXCEPTIONAL";

  playerIds: string[]; // <= 6 in closed beta
  currentSceneId: string;

  discoveredEvidenceIds: string[];
  examinedObjectIds: string[];
  unlockedSuspectIds: string[];
  unlockedDialogueIds: string[];
  knownTimelineEventIds: string[];

  teamTheory: TeamTheory | null;
  accusationProposal: AccusationProposal | null;
  finalAccusation: FinalAccusation | null;

  score: number;
  contributionSummary: ContributionSummary;

  startedAt: Timestamp | null;
  updatedAt: Timestamp;
  lastActivityAt: Timestamp | null;
  pausedAt: Timestamp | null;
  pausedBy: string | null;
  solvedAt: Timestamp | null;
  archivedAt: Timestamp | null;
}
```

### Bounded-state rule

The session document must not contain unbounded:

- chat messages;
- dialogue transcript history;
- event history;
- contribution history;
- arbitrary AI output;
- media bytes.

Those belong in subcollections or external media storage.

Firestore documents have a size limit, so keeping the session aggregate bounded is a hard
architectural requirement. Current Firebase documentation also recommends reducing index
fanout and avoiding unnecessary indexed fields. See Firebase Firestore quotas and best
practices.

## 17.5 When arrays are acceptable

Small bounded arrays are acceptable for closed beta:

- `playerIds`: max 6;
- discovered evidence IDs: bounded by case design;
- examined object IDs: bounded by case design;
- unlocked dialogue IDs: bounded by case design;
- known timeline IDs: bounded by case design.

If a future case size makes any of these large enough to threaten the document boundary,
the representation must move to a subcollection without changing gameplay semantics.

## 17.6 Transaction boundaries

A mutation that changes canonical session state must be performed inside one transaction
when its correctness depends on current state.

Examples:

### Discover evidence

```text
read session
→ verify OPEN
→ verify object/evidence not already discovered
→ mutate discoveredEvidence
→ update lastActivityAt
→ increment bounded aggregate if needed
→ write EVIDENCE_DISCOVERED event
→ commit
```

### Final accusation

```text
read session
→ verify OPEN
→ verify no final accusation exists
→ verify proposal/quorum rules
→ evaluate canonical solution
→ set finalAccusation
→ set state = CLEARED
→ set outcome
→ calculate final score
→ write FINAL_ACCUSATION + CASE_CLEARED events
→ commit
```

The commit must make it impossible for two concurrent final accusations to both succeed.

## 17.7 Idempotency contract

Every externally retriable critical action needs a stable action/idempotency key.

Preferred sources:

```text
Telegram callback query ID
Telegram update ID + action discriminator
or a generated application actionId passed through the request
```

The key maps to an immutable processing record or event identity.

Invariant:

```text
same action key + same session
→ at most one successful state mutation
→ at most one reward contribution
→ retry returns the existing logical result
```

Idempotency scope should be limited to the action's business identity; a new legitimate
action must not collide with an old one.

## 17.8 Optimistic concurrency

Firestore transactions retry when a read document changes concurrently. The game engine
must therefore be written as a pure state transition function over the transaction's latest
snapshot and must have no externally visible side effects before commit.

Never call an AI provider, Telegram send, or external side-effecting API from inside the
Firestore transaction callback.

## 17.9 Side-effect ordering

Canonical persistence comes first:

```text
validate
→ transaction commit
→ domain event exists
→ asynchronous/non-critical side effects
```

Examples of post-commit work:

- XP update;
- achievement unlock;
- analytics aggregation;
- Telegram notification;
- leaderboard refresh.

If a post-commit side effect fails, it may be retried from the canonical event without
re-running the original gameplay mutation.

## 17.10 Exactly-once is not assumed

The system assumes delivery is **at-least-once** at integration boundaries.

Therefore:

```text
Telegram delivery
AI provider callback
notification send
analytics handler
```

must all tolerate retries.

The game engine itself must behave as if duplicate requests are normal.

## 17.11 Event schema

```ts
interface CaseEvent {
  eventId: string;
  eventVersion: number;
  sessionId: string;
  caseVersionId: string;
  groupId: string;
  actorUserId: string | null;
  type: CaseEventType;
  payload: Record<string, unknown>;
  actionId: string | null;
  occurredAt: Timestamp;
}
```

`payload` must remain small and contain references rather than large snapshots whenever
possible.

Events should describe **what happened**, not copy the entire session state.

## 17.12 Event retention

Closed-beta event retention is configurable. Product-critical case outcomes and personal
career aggregates may be retained longer than operational/debug events.

A retention policy should prefer collection-level expiration/cleanup rather than application
code scanning the full event history. Firestore TTL can be used for suitable operational
collections; it is asynchronous and should not be treated as a real-time state transition.
Current Firebase documentation notes that TTL deletions are typically processed within 24
hours and count as deletes.

## 17.13 Index strategy

Start with the smallest index set required by real queries.

Expected query families:

```text
sessions by group + active state
sessions by status + updatedAt
case events by session + occurredAt
contributions by session + player
player leaderboard by XP/score
```

Avoid indexing large text blobs or high-churn fields that are never queried.

For TTL fields and other timestamp fields, explicitly review index strategy to avoid fanout
and hotspots where applicable.

## 17.14 Security boundary

The Vercel backend, using server-side Firebase credentials, is the authoritative writer for
game state.

Client/Mini App supplied values are treated as untrusted input.

The server must derive and validate:

- user identity;
- group membership/access;
- active detective status;
- session state;
- evidence unlocks;
- score/reward values;
- accusation eligibility.

A client may request an action but never specify its authoritative outcome.

## 17.15 Recovery scenarios

### Function fails before commit

No canonical mutation exists. Safe to retry.

### Function fails after commit but before Telegram response

Retry sees the idempotency key and returns the already-committed result.

### Function fails after commit and after some side effects

Canonical event remains authoritative. Side effects are deduplicated using their own event/action key.

### Event consumer fails

Replay/retry the event consumer. Never mutate session truth to compensate for a failed consumer.

## 17.16 Firestore anti-patterns explicitly prohibited

```text
❌ one gigantic session document containing full transcript
❌ AI-generated text stored repeatedly in session state
❌ media blobs in Firestore
❌ increment score without the gameplay mutation that earned it
❌ Telegram API calls inside Firestore transactions
❌ scanning all historical events on every gameplay action
❌ client-written score/XP
❌ cron jobs that rewrite every session to mark COLD
```

## 17.17 Persistence invariants

**PERSIST-01** — `CaseVersion` is immutable after publish.

**PERSIST-02** — `CaseSession` is the authoritative mutable aggregate for one playthrough.

**PERSIST-03** — Session documents remain bounded and do not store chat/media/event history wholesale.

**PERSIST-04** — Critical gameplay mutations are transactionally guarded by current state.

**PERSIST-05** — Critical actions are idempotent.

**PERSIST-06** — Duplicate requests cannot duplicate score, XP, evidence, or final resolution.

**PERSIST-07** — External side effects never occur inside Firestore transactions.

**PERSIST-08** — Post-commit side effects are driven by canonical events and may be retried.

**PERSIST-09** — Derived status (`INACTIVE`, `COLD`) is computed lazily from persisted timestamps.

**PERSIST-10** — Firestore is not used as media storage or raw chat archive.

**PERSIST-11** — Database queries and indexes are designed from actual query patterns, not from every available field.

**PERSIST-12** — Server-side game logic, not the Telegram client or Mini App, is authoritative for score and truth.

## 17.18 Authoritative references

- Firebase Firestore quotas and limits: https://firebase.google.com/docs/firestore/quotas
- Firebase Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firebase Firestore best practices: https://firebase.google.com/docs/firestore/best-practices
- Firebase Firestore TTL: https://firebase.google.com/docs/firestore/ttl
