# 11 — Project Structure

Contoh struktur monorepo:

```text
apps/
  bot/
  miniapp/

packages/
  game-core/
  case-schema/
  case-engine/
  ai-gateway/
  telegram-adapter/
  database/
  analytics/
  moderation/
  shared/

data/
  case-seeds/
  generated-cases/
  prompt-templates/

scripts/
  generate-cases/
  validate-cases/
  migrate/

infra/
  env/
  deployment/

docs/
```

## 11.1 game-core

Pure deterministic logic sebisa mungkin.

Tidak tahu tentang Telegram atau provider AI.

## 11.2 case-schema

Types/validators untuk Case Bible dan case content.

## 11.3 case-engine

Mengatur:

- investigation state;
- evidence unlock;
- interrogation;
- timeline;
- accusation;
- scoring.

## 11.4 ai-gateway

Interface:

```text
TextModel
ImageModel
ModerationModel
```

Provider dapat diganti tanpa menyentuh game core.

## 11.5 telegram-adapter

Mengubah domain action menjadi Telegram messages/buttons.

## 11.6 database

Repository layer:

```text
CaseRepository
SessionRepository
UserRepository
GroupRepository
StatsRepository
EventRepository
```

## 11.7 testing

Wajib minimal:

- unit test game engine;
- schema validation tests;
- case consistency tests;
- idempotency tests;
- integration tests Telegram webhook;
- snapshot tests untuk generated response.
