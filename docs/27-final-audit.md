# 27 — Final Design Audit

## Status
**LOCKED — PRE-CODING AUDIT**

## 27.1 Audit result

The v7 design has been consolidated into a coding baseline. The main stale terminology conflicts were normalized:
- `OPEN_PENDING` removed from runtime lifecycle;
- `COLD_CASE` treated as derived status, not persisted state;
- wrong final accusation is terminal (`CLEARED + FAILED`);
- closed beta is the current implementation target; public/open beta is the later expansion target.

## 27.2 Architecture decision

Use a **modular monolith** with a small Vercel route surface.

```text
4 deployed functions target
12-function absolute ceiling
```

Feature modules are libraries, not serverless endpoints.

## 27.3 What is frozen before coding

Frozen:
- domain hierarchy;
- session state machine;
- shared/personal state split;
- evidence semantics;
- timeline/causal/proof semantics;
- interrogation authority model;
- accusation semantics;
- persistence boundaries;
- event/idempotency model;
- AI authority boundary;
- case validation gate;
- Telegram callback authorization;
- free-tier architecture posture;
- beta acceptance gates.

## 27.4 What remains intentionally configurable

Configuration, not architecture:
- inactivity/cold thresholds;
- score weights;
- hint penalties;
- case difficulty star-rating formula;
- rate-limit numbers;
- generated-case volume;
- prompt/model/provider versions;
- message wording and visual style.

Changing these must not require a domain schema rewrite.

## 27.5 Implementation rule

When an implementation question appears, prefer:
1. existing locked contract;
2. smallest deterministic rule;
3. configuration over new state;
4. new field only when the domain cannot be represented by existing contracts;
5. architecture change only with an explicit decision-log entry.

## 27.6 Coding start condition

Coding may begin from the v8 baseline. Any future change that affects a locked invariant must be recorded as a deliberate architecture/product decision rather than silently patched in code.
