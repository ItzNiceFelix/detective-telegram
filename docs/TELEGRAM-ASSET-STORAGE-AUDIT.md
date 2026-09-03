# Telegram Asset Storage — Feasibility Audit

**Status**: AUDIT ONLY — no code, no dependency, no endpoint, no Firebase upgrade. No source modified.
**Constraint gating this audit**: Firebase Cloud Storage requires an upgrade; the team does not want to upgrade Firebase for the closed beta. The question is whether the **Telegram Bot API asset vault** can be the durable storage for game image assets **without changing domain contracts**.

---

## 1. Method & current-state facts

Reviewed: `docs/26-coding-baseline.md`, `docs/20-ai-generation-validation-contract.md`, `docs/AI-INTEGRATION-READINESS.md`, `docs/AI-PROVIDER-DECISION.md`, plus current code (`KontrakPenyimpananGambar`, `PenyimpananGambarFirebase`, `GeminiImageProvider`, `TelegramAdapter`, composition root, `RepositoriAsetVisualFirestore`, `versi-kasus.ts`).

Current facts (verified, no code change):

| Item | State today |
| ---- | ----------- |
| `KontrakPenyimpananGambar` | `simpan(kunci, obyek) → uri:string`; `ada(uri) → boolean`. Storage-agnostic. |
| `PenyimpananGambarFirebase` | Firebase Storage via `getStorage()`. Returns `gs://bucket/…`. **Needs Storage upgrade = blocked.** |
| `GeminiImageProvider` | Returns JSON metadata `{ uri: "asset://gemini/…", bytesBase64, sizeBytes, format, … }`; hands base64 to the pipeline for object-storage persist (VISUAL_02/03). |
| `TelegramAdapter` | **Text outbound only as JSON**: `sendMessage`, `getChatMember`. **No** `sendPhoto`, `getFile`, multipart/`FormData`. |
| `hasilkanAsetGambar` dedup | Cache key `caseId:sceneId:planId`; on hit calls `penyimpanan.ada(uri)` **only if** `isUriDurable(uri)` (`gs://` or `asset://memori/`). |
| Firestore asset model | `visual_assets` doc key = `caseId:sceneId:planId` (metadata + `uri` ref, **no binary**). Manifest in `visual_asset_manifests`. |
| `CaseVersion` | Immutable; holds `assetManifestRef` (build-time ref). Runtime does **not** send images today. |
| Runtime image send | **Not implemented** (no `sendPhoto` anywhere). |

---

## 2. Proposed architecture (to be evaluated)

```
Gemini Image Provider
  → binary image
  → Telegram Bot API sendPhoto            (upload to private asset vault chat/channel)
  → returned Message.photo[].file_id
  → Firestore asset metadata/manifest     (uri := file_id, still NO binary in Firestore)

Gameplay (future):
  CaseVersion asset file_id
  → Telegram sendPhoto(photo = file_id)   (re-send cached media to player/group)
```

Adapter boundary: a new `PenyimpananGambarTelegram` implementing the **existing** `KontrakPenyimpananGambar`:
- `simpan(kunci, obyek)` → `sendPhoto` to vault → returns `file_id` (as the "uri").
- `ada(uri)` → `getFile(file_id)` to probe existence.

---

## 3. Audit answers

### Q1 — Can the current Telegram adapter upload `sendPhoto` via multipart/form-data?
**No.** The adapter only POSTs `application/json` (`sendMessage`, `getChatMember`). `sendPhoto` with bytes requires `multipart/form-data` (or uploading by file URL, which we don't have). This is an implementation gap — adding multipart outbound (`FormData` + `Blob`) is feasible without touching the domain.

### Q2 — Can it capture `Message.photo[].file_id`?
**Not today.** The adapter parses `result` generically but does not read `photo[].file_id`. Feasible: `panggilApiTelegram("sendPhoto", …)` returns `result.photo[array]` → take the **largest** size entry → `file_id`. Needs new parsing code only.

### Q3 — Telegram permissions needed for the asset vault?
- The vault is a **private channel or private supergroup** the bot is a member of.
- Private **channel**: bot must be **administrator** (only admins can post in channels) or hold `can_post_messages`.
- Private **supergroup**: bot needs membership with **`can_send_media_messages`**.
- No special premium / BotFather token changes; the same `TELEGRAM_BOT_TOKEN` is reused for sending to a chat the bot belongs to.

### Q4 — Private group or private channel?
**Private channel is preferred.** A private channel is a clean, one-way vault: the bot is the only poster, no participant noise, minimal admin churn, photo messages retained. A secret supergroup also works if admins later need to view/manage; but for a pure asset vault a private channel minimizes moving parts.

### Q5 — Can the bot reliably reuse the same `file_id` later?
**Mostly yes, with caveats.** A `file_id` is:
- **Bot‑scoped**: works only for the same bot (not another bot, not a web client directly).
- **Stable for re‑sending**: the same bot can `sendPhoto(photo=file_id)` later — the documented, widely-used pattern; normally works indefinitely for photos the bot uploaded.
- **NOT an SLA-backed object store**: media may be flushed after prolonged inactivity or under abuse handling; **no guaranteed retention** like GCS. `getFile` download URLs are short-lived, but re-**sending** via `file_id` does not need the download URL.

Net: high reliability in practice for active assets, but **not guaranteed**.

### Q6 — What metadata must be stored in Firestore?
Reuse the existing `AsetVisual` doc (key `caseId:sceneId:planId`) storing **metadata + reference only** (no binary):
- `uri` := the Telegram `file_id` (the durable-identity string the domain carries).
- Plus existing fields: `assetId, planId, sceneId, caseId, provider, status, format, sizeBytes, requiredClues, forbiddenClues, verifyNotes, createdAt`.
- A self-describing discriminator, e.g. `storage: "telegram"`, `chatId` (vault), and optionally the vault `message_id` (for audit/recovery). Additive Firestore fields; **no domain contract change**.

### Q7 — Does `file_id` satisfy our durable-asset requirement?
**Partially / conditionally.** It satisfies "reference stored durably in Firestore, reusable across replay, no binary in Firestore". It does **not** satisfy a hard "guaranteed durable object": no retention SLA, no delete-protection, no silent-flush guarantee. Acceptable for a modest beta with actively-used assets; not enterprise-durable.

### Q8 — What happens if Telegram errors when reusing `file_id`?
`sendPhoto(photo=file_id)` returns a Bot API error (`ok=false`, e.g. `file_id not found`) → the adapter throws `KesalahanIntegrasi`. Because `uri = file_id` is **not** `isUriDurable`, the dedup path **skips `ada()`** on cache hit, so a dead `file_id` is **not** detected at dedup; it only fails at the moment of gameplay `sendPhoto`.

### Q9 — What recovery strategy should exist?
Recommended (no runtime regen, no new endpoint):
1. **Detect early**: on the build/publish path call `ada(file_id)` (`getFile`) and fail the publish gate if unreachable — same spirit as the existing Part C asset-manifest gate.
2. **On gameplay send failure**: fail-soft (log error, skip image, continue text gameplay) so a dead photo never blocks play (consistent with §20.21 runtime fallback).
3. **Manual rebuild**: telemark the asset as missing via admin; regenerate **offline** and publish a **new immutable CaseVersion** (regen policy §20.19) — never mutate the published one.
There is **no automatic self-heal** (see Q10).

### Q10 — Do we need to fall back to original image bytes/provider?
We deliberately keep **no** binary (in Firestore or elsewhere), and the vault only holds what Telegram keeps. If a `file_id` is flushed we cannot re-upload the *same* bytes without a second storage copy, and Gemini images are **non-deterministic** — regenerating yields a *different* image and violates the immutable CaseVersion. **Conclusion: no sound automatic byte fallback exists** without a secondary store; only administrative re-generation → new version. This is the largest durability risk.

### Q11 — Can this work entirely without Firebase Storage?
**Yes.** `PenyimpananGambarTelegram` implements the same `KontrakPenyimpananGambar` — the domain and storage layer neither know nor care that the backing store is Telegram. No bucket, no upgrade, no R2, no new provider SDK.

### Q12 — Does this preserve the current `KontrakPenyimpananGambar` without domain changes?
**Yes — with one behavioral nuance.**
- Interface unchanged: `simpan(kunci, obyek) → uri` and `ada(uri)` map cleanly to `sendPhoto→file_id` and `getFile`.
- Nuance: `isUriDurable(uri)` in the pipeline only recognizes `gs://`/`asset://memori/`. A `file_id` is not "durable" by that predicate, so on a cache hit `hasilkanAsetGambar` returns the existing asset **without** calling `ada()` (the `return existing` branch). Effect: the "object still exists" verification is skipped for Telegram refs (Q8). This is a behavioral implication, not a contract change.

### Q13 — Changes needed to the image publishing flow.
- Offline build: `GeminiImageProvider` → binary → `PenyimpananGambarTelegram.simpan` = `sendPhoto` to vault → `file_id` → Firestore `AsetVisual.uri` + manifest → `CaseVersion.assetManifestRef`.
- Publish gate: additionally verify `ada(file_id)` per asset (Q9) before allowing PUBLISHED (retain the existing "manifest non-empty" gate).
- Env/ops: add `TELEGRAM_ASSET_VAULT_ID` (+ optional `TELEGRAM_ASSET_VAULT_TYPE: channel|group`) to locate the vault. No new `/api` entrypoint.

### Q14 — Changes needed for replay.
Replay = new `CaseSession` on the **same** immutable `CaseVersion`. Because the manifest already carries the `file_id` refs (dedup key `caseId:sceneId:planId`), a new session **reuses** the same refs: no new image call, no new storage object, no binary to Firestore. Only change needed: the (future) gameplay image sender reads `file_id` from the manifest instead of regenerating.

### Q15 — Changes needed for Mini App (web) support.
**Weakest point.** A Telegram `file_id` is **not** a usable URL inside a web/MiniApp client. Rendering in a browser needs a real URL, which requires either a server-proxied download via `getFile` (`https://api.telegram.org/file/bot<token>/<path>`) behind a **new endpoint/proxy**, or a web-hostable store (Firebase Storage URL/CDN). The constraint disallows new endpoints, so the Telegram vault **cannot** directly serve Mini App/web images — effectively **Telegram-only, not web-compatible**.

---

## 4. Requirements preservation (explicit mapping)

| Requirement | Telegram vault |
| ----------- | -------------- |
| Asset dedup key `caseId:sceneId:planId` | ✅ unchanged (Firestore doc key) |
| No runtime image generation | ✅ (dedup returns existing) |
| No binary in Firestore | ✅ (`uri` = `file_id` reference only) |
| Immutable published CaseVersion | ✅ (refs immutable; regen only via new version) |
| Replay reuses same asset | ✅ |
| Provider not called on cache hit | ✅ (`hasilkanAsetGambar` returns existing; note Q12 nuance skips `ada()`) |
| No Firebase upgrade / no R2 / no new provider | ✅ |

---

## 5. Comparison — A. Firebase Storage vs B. Telegram Vault vs C. In-memory

| Dimension | A. Firebase Storage | B. Telegram Asset Vault | C. In-memory (current fake) |
| --------- | ------------------- | ----------------------- | --------------------------- |
| Durability | High (SLA, retention) | **Medium-Effort** (persists in practice, **no SLA**, silent flush possible) | **None** (lost on cold start) |
| Cost | Free tier; **requires upgrade = blocked now** | Free (no upgrade) | $0 (throwaway) |
| Implementation complexity | Low on our side; onboarding blocked | Moderate (add multipart `sendPhoto` + `getFile` parsing + vault env) | Low (existing) |
| Telegram dependency | None new | **New** hard dependency (vault chat + Bot API upload/re-send) | None |
| Replay reliability | High (stable ref) | Good if `file_id` persists; fails silently after flush | None (regen each boot) |
| Future Mini App/web compatibility | **High** (stable HTTPS URL) | **Poor** (file_id not web-usable; needs a proxy endpoint) | Poor (no persistence) |
| Free-tier suitability | ❌ blocked (upgrade) | ✅ | ✅ but not durable |

---

## 6. Feasibility verdict

The Telegram vault is a **technically feasible, free, Firebase-upgrade-free** way to store image assets for a **Telegram-only beta**, and it **preserves every listed "Preserve" requirement without changing domain contracts** (`KontrakPenyimpananGambar` is honored by a `PenyimpananGambarTelegram` adapter).

However it has three material weaknesses that make it a poor **canonical durable** store:

1. **Durability is best-effort, not guaranteed** — `file_id`/vault media has no retention SLA; silent flush is possible.
2. **No sound recovery** — we keep no binary (by design) and regeneration is non-deterministic, so a dead `file_id` cannot be auto-recovered without a second storage; only manual offline regen → a new immutable CaseVersion.
3. **Mini App / web incompatibility** — `file_id` cannot be rendered in a browser without a new proxy endpoint, which is disallowed.

Whether Telegram is the recommended choice depends on the definition of "durable." For a **guaranteed durable canonical asset store** the honest engineering recommendation is:

```
TELEGRAM_ASSET_STORAGE_RECOMMENDED = NO
```

**Qualification**: Telegram asset vault is acceptable **only as an explicitly-flagged beta workaround** (free, no upgrade, preserves all dedup/immutability/no-binary/no-runtime-gen invariants) if the team accepts: (a) best-effort durability, (b) admin-only recovery via a new CaseVersion, and (c) Telegram-only assets with **no** Mini App/web path without a future proxy. It should **not** be treated as the canonical durable asset store; if durable web-compatible storage is required later, a hosted object store (or a permissible proxy) remains necessary.

This document is an audit only — no implementation is recommended, and no source has been changed.