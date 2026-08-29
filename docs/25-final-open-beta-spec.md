# 25 — Final Open-Beta Specification

## Status
LOCKED BASELINE

## Product

A Telegram-native cooperative detective game centered on fictional, replayable mystery cases.

## Closed-beta limits

- 1 group;
- up to 30 group members;
- maximum 6 active detectives;
- one active session per group;
- spectators can view shared progress but cannot mutate gameplay.

## Gameplay contract

```text
LOBBY
  -> OPEN
  -> PAUSED <-> OPEN
  -> CLEARED
  -> ARCHIVED
```

Derived statuses:

```text
ACTIVE / INACTIVE / COLD
```

Core gameplay:

```text
Investigate
Inspect
Interrogate
Confront
Theory
Hint
Accuse
Resolve
```

Evidence and timeline are shared. Individual contribution is tracked separately.

## Case contract

A playable case is an immutable CaseVersion containing:

- Case Bible;
- suspects;
- scenes;
- inspectable objects;
- observations/evidence;
- statements;
- timeline;
- causal graph;
- proof graph;
- dialogue graph;
- visual plan/assets;
- canonical solution.

v1 requires exactly one valid canonical solution and at least one discoverable proof path.

## AI contract

AI can:

- generate draft case content;
- render deterministic semantic dialogue;
- create image prompts/assets;
- render hints/explanations.

AI cannot:

- mutate canonical truth;
- decide scoring;
- unlock arbitrary nodes;
- invent evidence or timeline facts at runtime.

## Runtime contract

The game is a modular monolith deployed through a small number of Vercel serverless entrypoints. The project targets **4 deployed functions**, with **12 as the absolute hard ceiling**.

## Free-tier posture

The application avoids dependency on:

- per-minute cron;
- Firebase Cloud Functions;
- persistent queue infrastructure;
- runtime image generation per interaction;
- full chat archival.

Firestore stores bounded game state and aggregates. Current Firebase Firestore no-cost documentation lists 1 GiB stored data, 50,000 reads/day, 20,000 writes/day, and 20,000 deletes/day for the standard free quota; exceeding Spark limits can disable that product for the remainder of the billing cycle. [Firebase](https://firebase.google.com/docs/firestore/quotas) [Firebase pricing](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Public/open-beta acceptance gate

All of the following must pass:

1. 20+ validated test cases;
2. complete end-to-end case lifecycle tests;
3. automated case solver/uniqueness checks;
4. duplicate webhook/callback tests;
5. transaction contention tests;
6. AI outage fallback test;
7. image failure fallback test;
8. moderation/report test;
9. usage counters and rate limits;
10. deployment verified at <=12 Vercel functions;
11. Firestore indexes reviewed for unnecessary fanout;
12. rollback procedure exercised;
13. no open P0/P1 gameplay bugs.

## Definition of Done

The beta is ready when a fresh group can add the bot, start a generated/published case, complete a full investigation, resolve it, review scores, and start/replay another case without administrator intervention except for operational controls intentionally retained for beta.
