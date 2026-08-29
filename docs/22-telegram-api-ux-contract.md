# 22 — Telegram API & UX Contract

## Status
LOCKED

## 22.1 Interface strategy

Telegram chat is the primary game interface. Inline keyboards are preferred over command-only UX for discoverable actions.

The closed beta supports:

- group game messages;
- inline investigation actions;
- private `/start` onboarding;
- callback-driven menus;
- optional Mini App entry points.

## 22.2 Command surface

Public commands are intentionally small:

```text
/start
/help
/case
/profile
/agency
/leaderboard
/theory
```

Gameplay actions are primarily buttons. Commands remain as accessibility and fallback paths.

## 22.3 Callback contract

Callback payloads are compact, authenticated by server-side session lookup, and treated as untrusted input.

Conceptual format:

```text
v1:<action>:<sessionShortId>:<targetId>
```

Do not encode canonical truth, score, permissions, or large JSON in callback data.

The server re-loads authoritative state before mutation.

## 22.4 Player authorization

Every gameplay callback validates:

1. chat belongs to session;
2. Telegram user is an active detective for that session;
3. session is `OPEN`;
4. requested action is legal;
5. target belongs to the referenced CaseVersion;
6. action is not already processed.

Spectator callbacks are rejected before game mutation.

## 22.5 Shared-message strategy

Investigation results are posted to the group and become shared case knowledge.

The bot should edit an existing progress message where practical instead of posting a new message for every state read. New messages are preferred for meaningful discoveries and story beats.

## 22.6 Message classes

```text
BRIEFING
SCENE
DISCOVERY
EVIDENCE
DIALOGUE
TIMELINE
THEORY
ACCUSATION
RESOLUTION
SYSTEM
```

Each class has a deterministic renderer and length limit.

## 22.7 Telegram failures

If a send fails after state commit:

- persist the intended outbound response as a bounded delivery record;
- retry idempotently where appropriate;
- never replay the gameplay mutation.

If Telegram is temporarily unavailable, the canonical game state remains authoritative.

## 22.8 Mini App boundary

Mini App is a presentation/query surface for:

- detective board;
- timeline;
- evidence graph;
- player/agency stats.

Mini App does not own game truth. Mutations call the same application services as Telegram and undergo the same authorization and transaction rules.
