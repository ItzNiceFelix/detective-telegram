# 18 — Domain Contract Map

## Status

**LOCKED BASELINE** — cross-domain ownership and write authority.

This document exists to prevent future implementation drift between the already-locked
product, gameplay, evidence, timeline, interrogation, scoring, and persistence contracts.

## 18.1 Domain ownership matrix

| Concern | Authoritative owner | AI may modify? |
|---|---|---|
| Canonical case truth | CaseVersion | No |
| Timeline facts | CaseVersion / Game Engine | No |
| Evidence validity | CaseVersion / Game Engine | No |
| Evidence discovery | CaseSession | No |
| Suspect canonical facts | CaseVersion | No |
| Dialogue unlocks | Game Engine | No |
| Suspect semantic response | Dialogue Engine | No |
| Dialogue wording | AI Narrative Renderer | Yes |
| Visual prompt wording | AI Visual Prompt Generator | Yes |
| Image pixels | Image Provider | Yes |
| Score | Scoring Engine | No |
| XP / achievements | Progression consumers | No |
| Session status | Session State Machine | No |
| Analytics | Analytics subsystem | No |

## 18.2 Mutation authority

```text
Telegram / Mini App
        ↓ request
Command / Action Layer
        ↓
Game Engine
        ↓
Domain validation
        ↓
Firestore transaction
        ↓
Canonical state + event
```

AI sits beside this flow:

```text
Game Engine
   ↓ semantic request
AI Gateway
   ↓
AI provider
   ↓
rendered presentation
```

AI does not get a direct write path to `CaseSession`, `CaseVersion`, score, or progression.

## 18.3 Dependency rule

Lower-level domain modules must not depend on presentation modules.

Allowed:

```text
Bot → Game Engine
Game Engine → Repository
Game Engine → Domain Rules
AI Renderer → Semantic Response
```

Not allowed:

```text
Game Engine → Telegram message formatter
Game Engine → provider SDK
Game Engine → Mini App UI
AI → Firestore truth write
```

## 18.4 Determinism rule

Given the same:

```text
CaseVersion
+ CaseSession state
+ validated action
```

the Game Engine must produce the same canonical transition and outcome.

Presentation may vary; truth may not.

## 18.5 Version compatibility

All persisted domain events and CaseVersions carry schema/version metadata.

New code must be able to read the currently supported persisted versions during migration.

A schema migration may transform storage representation, but may not silently change the
meaning of an already-published CaseVersion or historical event.

## 18.6 Contract test categories

Before open beta, automated tests should cover:

- state transition legality;
- evidence discovery idempotency;
- shared-state synchronization;
- interrogation prerequisite resolution;
- contradiction discovery;
- proof graph evaluation;
- accusation quorum;
- single final accusation;
- concurrent mutation handling;
- event emission;
- score contribution deduplication;
- AI output containment;
- case generation validation.

## 18.7 Architecture decision rule

When a feature request appears, first classify it:

```text
A. new presentation
B. new derived/progression behavior
C. new canonical gameplay rule
D. new persisted state
E. new external provider
```

A/B should normally extend existing contracts. C/D require a domain decision record before
changing locked contracts. E must implement an existing provider interface whenever one exists.
