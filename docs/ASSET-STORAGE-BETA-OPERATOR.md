# Asset Storage (Beta) — Operator Runbook

**Scope**: operator procedure for the `TELEGRAM_BETA` asset provider (docs/ASSET-STORAGE-DECISION.md).
**Important**: `file_id` is **BEST_EFFORT**, not a guaranteed durable URI. Never log credentials/API tokens.

---

## 1. Configure asset vault chat/channel

- Create a **private Telegram channel** dedicated to the asset vault — **separate** from any gameplay group.
- Copy the channel ID (numeric, e.g. `-1001234567890`). For private channels, use the shared-links `@username` resolved to the numeric `chat_id` via `getChat`/`@getidsbot`, and confirm the bot is a participant.
- Set env:
  ```
  ASSET_STORAGE_PROVIDER=TELEGRAM_BETA
  TELEGRAM_ASSET_VAULT_CHAT_ID=<numeric channel id>
  TELEGRAM_BOT_TOKEN=<bot token>
  ```
  If `ASSET_STORAGE_PROVIDER=TELEGRAM_BETA` is set without `TELEGRAM_ASSET_VAULT_CHAT_ID`, the composition root fails fast with a clear `KesalahanKonfigurasi`.

## 2. Configure bot permissions

- The bot must be able to **post in the channel** (administrator / `can_post_messages`) — or a member able to send media in a supergroup if a group is used.
- The bot needs to be able to call `sendPhoto` to that chat. No extra BotFather setting is required to *send* media to a chat the bot belongs to.
- Keep the vault private; do **not** join players to the vault.

## 3. Generate one image (offline/admin)

The image generation is an offline/admin build path (not runtime): first a `generateCase` candidate, then image plan(s) consumed by `generateImages`. This is the existing admin flow; only the storage backend changes.

## 4. Upload one image

With `TELEGRAM_BETA` wired, the pipeline calls `PenyimpananAsetTelegram.simpanTerperinci()`, which performs one Bot API `sendPhoto` (multipart) to the vault chat and returns the captured `file_id`. Only **one** upload per unique `caseId:sceneId:planId`.

## 5. Capture file_id

`kirimFotoTelegram` selects the highest-resolution `photo[].file_id` and returns `{ fileId, width, height, sizeBytes }`. The `file_id` becomes `AsetVisual.uri` (the persisted reference) — never treat it as durable.

## 6. Verify Firestore manifest

- Asset metadata is stored in `visual_assets` (doc key `caseId:sceneId:planId`) and the manifest in `visual_asset_manifests` — **metadata/ref only, no binary**.
- Verify: `storageProvider = "TELEGRAM_BETA"`, `durability = "BEST_EFFORT"`, `uri = <file_id>`, `status = VERIFIED/READY`, `verifiedAt` set, and `width/height/mimeType/sizeBytes` populated.
- Publish gate: an AI-generated case is publishable only when the manifest exists, is non-empty, and every asset has a non-empty reference and is not `UNAVAILABLE/SUSPECT`. Verification happens at creation/publish, not per replay.

## 7. Replay asset

Replay reuses the same `file_id` reference from the manifest — **no new image generation, no new upload, no per-replay Telegram verification**. If a runtime send fails:
- mark asset `SUSPECT`/`UNAVAILABLE` (no automatic regeneration at runtime),
- require **admin/offline regeneration**,
- regeneration that changes the canonical asset yields a **new immutable CaseVersion**.

---

## Safety notes

- Never write API keys or bot tokens to logs/files.
- Do **not** run bulk generation; keep to single uploads for verification.
- Standard automated tests never call live Telegram (they use fake fetch/fake adapter).

This is operator documentation only; no live Telegram success is claimed here.