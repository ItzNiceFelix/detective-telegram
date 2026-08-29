# 16 — Player, Group, Contribution & Scoring Contract

## Status

**LOCKED BASELINE** — multiplayer participation, contribution attribution, scoring, accusation proposal, and progression contract.

## 16.1 Domain roles

```text
Group
  ├── Detective (active player)
  └── Spectator
```

A `Group` owns the social context of a `CaseSession`. A `Detective` is a registered active
player for that session. A `Spectator` can consume public/shared information but cannot
mutate gameplay during the closed beta.

Closed-beta limit: maximum **6 active detectives** per session.

## 16.2 Authoritative state

Shared gameplay state lives in `CaseSession` and its related case event/aggregate data.
There is no per-player shadow copy of evidence or timeline knowledge in the default
cooperative mode.

Personal records contain only attribution/progression information such as: discovery
credit, contribution score, hints used, and career statistics.

## 16.3 Contribution ledger

Every reward-bearing action creates at most one canonical contribution for the relevant
action. The contribution is keyed by an idempotency key/action ID.

```ts
type ContributionType =
  | "EVIDENCE_DISCOVERY"
  | "CONTRADICTION_FOUND"
  | "CONFRONTATION_SUCCESS"
  | "THEORY_CONTRIBUTION"
  | "FINAL_RESOLUTION";

interface Contribution {
  contributionId: string;
  sessionId: string;
  playerId: string;
  type: ContributionType;
  sourceEventId: string;
  points: number;
  createdAt: string;
}
```

Contribution is an attribution record. It does not become another source of gameplay truth.

## 16.4 Reward principles

1. Reward first meaningful progress, not message volume.
2. Repeating an already resolved action yields no additional contribution.
3. Contribution values are configuration, not hard-coded domain truth.
4. Hint use can reduce score but never create positive score by itself.
5. Contribution bonus is bounded so more participants do not produce infinite group score.

## 16.5 Case score

Canonical score dimensions: correctness, investigation quality, and assistance/penalties.

Example baseline (tunable):

```text
Evidence discovery          +50
Contradiction               +75
Confrontation              +100
Meaningful theory          +100
Correct final resolution   +500
Full-clear bonus           +250
Exceptional-clear bonus    +100
```

The exact numbers are a tuning parameter. The engine must expose a scoring configuration
through `CaseVersion.scoring`.

## 16.6 Group score

Group score is a bounded aggregate:

```text
baseResolutionScore
+ boundedContributionBonus
- hintPenalty
- configuredPenalty
```

A group cannot increase score indefinitely by repeating actions or by having more spectators.

## 16.7 Career progression

Career progression is derived from canonical session events. It may include:

- XP
- detective rank
- achievements
- streaks
- case history
- agency/group progression

Career progression is never used as the canonical source for resolving the case.

## 16.8 Accusation proposal lifecycle

```text
DRAFT
  ↓ submit
PROPOSED
  ↓ quorum
QUALIFIED
  ↓ confirm
FINAL
  ↓ engine evaluates
RESOLVED
```

A proposal can be withdrawn before `FINAL`. Only `FINAL` ends the session.

Default cooperative quorum:

```text
quorum = (activeDetectives == 1) ? 1 : floor(activeDetectives / 2) + 1
```

For one active detective, quorum is one.

## 16.9 Final accusation rules

A session permits exactly one final accusation.

Outcomes:

```text
correct culprit + all main dimensions correct
  → CLEARED / SOLVED / FULL

correct culprit + one or more main dimensions wrong
  → CLEARED / EXCEPTIONAL / PARTIAL

wrong culprit
  → CLEARED / FAILED
```

There is no second final accusation attempt.

## 16.10 Concurrency / idempotency

Score and contribution mutations must occur transactionally with the state mutation that
justifies them. An action retry must return the same logical result, not award duplicate points.

Two simultaneous final accusation requests must resolve to exactly one winning commit.

## 16.11 Canonical events

Progression may consume these immutable events:

```text
PLAYER_JOINED
PLAYER_LEFT
EVIDENCE_DISCOVERED
CONTRADICTION_FOUND
CONFRONTATION_SUCCESS
THEORY_UPDATED
HINT_USED
ACCUSATION_PROPOSED
ACCUSATION_QUALIFIED
FINAL_ACCUSATION
CASE_CLEARED
CASE_ARCHIVED
```

Raw Telegram messages are not progression events.

## 16.12 Locked invariants

**SCORE-01** — Shared case progress is not duplicated per detective in default co-op.

**SCORE-02** — Individual contribution is attribution/progression data, not canonical game truth.

**SCORE-03** — Repeated non-progress actions cannot generate unlimited rewards.

**SCORE-04** — Group score is bounded.

**SCORE-05** — Exactly one final accusation is allowed per session.

**SCORE-06** — Wrong final accusation resolves the session as `CLEARED + FAILED`.

**SCORE-07** — Pre-final accusation proposals are reversible.

**SCORE-08** — Default cooperative quorum is simple majority.

**SCORE-09** — Reward-bearing mutations are idempotent and concurrency-safe.

**SCORE-10** — Long-term progression consumes canonical gameplay events, never raw message count.
