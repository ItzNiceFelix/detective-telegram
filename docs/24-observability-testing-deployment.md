# 24 — Observability, Testing & Deployment Contract

## Status
LOCKED

## 24.1 Test layers

### Unit tests

- state transition guards;
- scoring;
- proof graph evaluation;
- evidence discovery;
- dialogue prerequisites;
- timeline constraints;
- callback parsing;
- authorization rules.

### Integration tests

- Firestore repositories;
- Telegram adapter;
- idempotency;
- transaction conflicts;
- AI gateway contract;
- image asset registration.

### Case validation tests

Every published CaseVersion must pass structural, referential, temporal, causal, solvability, uniqueness, and safety validation.

### End-to-end tests

At minimum:

```text
start group
-> create session
-> join detectives
-> start case
-> investigate
-> inspect
-> interrogate
-> confront
-> build theory
-> accuse
-> resolve
-> archive
```

## 24.2 Invariants tested in CI

- one active session per group;
- max six active detectives;
- spectators cannot mutate gameplay;
- one final accusation;
- no duplicate reward;
- immutable CaseVersion;
- no impossible state transitions;
- no published case with multiple valid solutions.

## 24.3 Structured logging

Every request receives a request/correlation ID. Domain events receive their own immutable event IDs.

Logs must distinguish:

```text
INFO
WARN
ERROR
SECURITY
GAMEPLAY
AI
TELEGRAM
DATABASE
```

## 24.4 Metrics

Track counters and durations, not raw message archives:

- updates received;
- valid actions;
- rejected actions;
- transaction conflicts;
- case starts/completions;
- hints used;
- accusations;
- solve rate;
- AI calls;
- AI failures;
- image generation jobs;
- Telegram send failures;
- Firestore reads/writes where measurable.

## 24.5 Deployment

Production-like environments:

```text
local
staging / test bot
closed-beta production bot
```

Secrets are environment variables. No credentials in repository.

## 24.6 Rollback

Application rollback must not rewrite CaseVersion or historical session state. Code versions must remain compatible with the persisted schema or use explicit migrations.

Case content rollback is achieved by unpublishing/disabling a CaseVersion, not mutating its canonical truth.

## 24.7 Backup reality on Spark

The design must not depend on paid Firestore backup/PITR features. Current Firebase documentation notes that backup/PITR/restore/clone features require billing, while Firestore free usage includes daily limits on reads/writes/deletes and 1 GiB storage. [Firebase quotas](https://firebase.google.com/docs/firestore/quotas).
