# 21 — Runtime Contract & Vercel Function Budget

## Status
LOCKED

## 21.1 Hard deployment constraint

For this project, the Vercel Hobby deployment is treated as having a hard budget of **12 deployable serverless functions**. This is an engineering constraint for the project even if vendor limits change later.

Vercel's deployment model counts files exposed as functions under `/api`; shared code must live outside the function entrypoint tree. Vercel staff have explicitly recommended moving helpers outside `/api` to avoid extra functions. [Source: Vercel Community](https://community.vercel.com/t/serverless-function-limit/12797).

## 21.2 Function allocation

Target maximum: **4 functions**, leaving 8 slots of headroom.

```text
/api/telegram.ts       # Telegram webhook
/api/cron.ts           # optional maintenance endpoint; feature-flagged
/api/admin.ts          # protected operations
/api/health.ts         # health/readiness
```

No other top-level `/api/*` function files are permitted unless the function budget is re-approved.

All business logic lives in importable modules outside `/api`:

```text
src/
  bot/
  game/
  cases/
  ai/
  players/
  groups/
  database/
  security/
  services/
```

If a framework route convention creates additional functions, the repository must be checked after every deployment build. The hard cap is on deployed function entrypoints, not source modules.

## 21.3 Single request pipeline

```text
Telegram Update
  -> webhook authentication
  -> update idempotency
  -> identity / chat resolution
  -> rate / permission check
  -> command or callback normalization
  -> Game Application Service
  -> Firestore transaction for mutation
  -> commit
  -> post-commit domain events
  -> render Telegram response
```

## 21.4 Rules

1. No AI provider call inside a Firestore transaction.
2. No Telegram outbound call inside a Firestore transaction.
3. Transaction reads only documents required for the mutation.
4. The transaction produces a canonical domain result and event list.
5. Side effects run after commit and are individually idempotent.
6. A failed side effect must not roll back canonical game state.
7. Every critical action carries an idempotency key.
8. Runtime has deterministic fallbacks for AI and Telegram send failures.

## 21.5 Idempotency

Primary source identifiers:

- Telegram `update_id` for update-level dedupe.
- Telegram `callback_query.id` or generated action ID for action-level dedupe.

Stored markers are bounded and may be compacted by retention policy. Canonical state itself must remain enough to reject duplicate critical mutations even if an old marker is gone.

## 21.6 Concurrency

Critical mutations use Firestore transactions or equivalent compare-and-set semantics.

Examples:

- first final accusation wins;
- evidence discovery can only create one evidence-discovered transition;
- hint count cannot go below zero;
- score cannot be awarded twice for the same credited action.

## 21.7 Response strategy

The system does not require a durable job queue for closed beta. Long-running generation is an offline/admin workflow, not a synchronous Telegram webhook dependency.

If an operation risks approaching the platform execution limit, the bot acknowledges and schedules/records an asynchronous generation job outside the player interaction path. Open-beta infrastructure may replace this with a queue later without changing the game domain contracts.

## 21.8 Maintenance endpoint

`/api/cron.ts` is optional. Core case/session behavior must not depend on it. Inactivity/cold status is derived lazily. Daily case rotation may be precomputed or triggered by the first eligible request.
