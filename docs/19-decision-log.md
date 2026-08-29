# 19 — Decision Log

## v5 — Persistence & Domain Contracts Locked

### Added

- Firestore persistence contract.
- Bounded `CaseSession` aggregate policy.
- Transaction and idempotency contract.
- Post-commit side-effect model.
- Event retention and index guidance.
- Domain authority / dependency map.

### Clarified

- `CaseVersion` remains immutable.
- `CaseSession` is authoritative mutable gameplay state.
- Events are audit/progression inputs, not state truth.
- AI has no canonical game-state write authority.
- External provider calls must never happen inside Firestore transactions.
- Duplicate delivery is assumed normal.


## v6 — AI & Case Validation Locked

### Added

- Untrusted AI generation model.
- Truth-first generation contract.
- Visual Plan and asset QA contract.
- Strict runtime AI context boundary.
- Multi-layer publish validation.
- Solver-based solvability/uniqueness verification.
- AI provider/generation version recording.

### Locked

- AI never has canonical live-game write authority.
- Published CaseVersion is immutable.
- Failed generation/validation blocks publish.
- Runtime AI failure cannot block gameplay.
- v1 generated cases must have exactly one canonical solution.

## v7 — Runtime / Telegram / Security / Operations Locked

### Locked

- 12-function hard engineering ceiling; 4-function target.
- Modular monolith with business logic outside `/api`.
- Runtime request pipeline and idempotency rules.
- Telegram callback authorization and shared-message strategy.
- Mini App shares the same application services and authority boundary.
- Security, moderation, testing, rollback, and observability baseline.

## v8 — Coding Baseline Locked

### Locked

- Final consolidation of domain contracts into `docs/26-coding-baseline.md`.
- Final terminology audit in `docs/27-final-audit.md`.
- `OPEN_PENDING` and persisted `COLD_CASE` removed from runtime contract.
- Wrong final accusation is terminal: `CLEARED + FAILED`.
- Closed beta is the immediate implementation target; public/open beta is a later expansion target.
- No new domain features are required before coding; remaining knobs are configuration.
