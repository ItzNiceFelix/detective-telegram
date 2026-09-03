# Asset Storage Decision

**Status**: DECISION RECORD — no code, no dependency install, no source changed. Supersedes/endorses the feasibility findings in `docs/TELEGRAM-ASSET-STORAGE-AUDIT.md`.

## Context

Firebase Cloud Storage requires a project upgrade, which we do **not** want for the closed beta. Per `docs/TELEGRAM-ASSET-STORAGE-AUDIT.md`, Telegram is **not** accepted as the *canonical durable* asset store (no retention SLA, weak recovery, Telegram-only/web-incompatible). However, for the beta **without** the Firebase Storage upgrade, we accept the **Telegram Asset Vault as an explicit beta-only media provider**: `TELEGRAM_BETA`.

The canonical production target remains **`FIREBASE_STORAGE`**.

---

## Decision

### Beta

Use **`TELEGRAM_BETA`** for generated image assets while Firebase Storage is unavailable.

Telegram Asset Vault usage:

- Private **Telegram channel** preferred (bot can upload media).
- Bot uploads media to the vault via Bot API (`sendPhoto`).
- Capture `Message.photo[].file_id`.
- Store `file_id` + metadata in Firestore (asset manifest layer).
- Replay uses the stored `file_id` — same reference reused.
- **No runtime image regeneration.**
- **No binary in Firestore.**

### Canonical production target

Keep **`FIREBASE_STORAGE`** as the destination for asset **durability** and future **Mini App / web compatibility**.

- Firebase Storage gives a stable HTTPS reference that any client (web/Mini App) can display — unlike a Telegram `file_id`.
- Durability with an SLA/retention model, delete/regen-safe.

---

## Important semantic rule

**A Telegram `file_id` is NOT a guaranteed durable URI.** Never treat it as equivalent to an object-store reference.

Asset metadata **must** distinguish:

- **provider** — which storage/adapter produced the reference
- **reference** — the concrete handle (e.g. `file_id`, or `gs://…`)
- **durability** — durability class of that reference
- **verifiedAt** — when the reference was verified to be valid
- **status** — lifecycle state of the reference

Example conceptual metadata:

```jsonc
// Beta (Telegram)
{
  "storageProvider": "TELEGRAM_BETA",
  "reference": "<file_id>",
  "durability": "BEST_EFFORT",
  "verifiedAt": "2026-09-03T00:00:00.000Z",
  "status": "VERIFIED"
}

// Future canonical (Firebase Storage)
{
  "storageProvider": "FIREBASE_STORAGE",
  "reference": "gs://<bucket>/assets/cases/…/….png",
  "durability": "DURABLE",
  "verifiedAt": "2026-09-03T00:00:00.000Z",
  "status": "VERIFIED"
}
```

Semantics of `durability`:

| Class | Meaning |
| ----- | ------- |
| `DURABLE` | Retention/SLA-backed durable object (Firebase Storage). Safe to treat as stable. |
| `BEST_EFFORT` | Reference persists in practice but has no SLA; a `file_id` may be flushed/silently invalid (Telegram). |

Semantics of `status`:

| Value | Meaning |
| ----- | ------- |
| `VERIFIED` | Reference confirmed valid at `verifiedAt`. |
| `SUSPECT` / `UNAVAILABLE` | Reference no longer verifiable/usable (e.g. runtime send failed). Never auto-regenerated at runtime. |

A reference is only trusted per its durability class: `BEST_EFFORT` refs are audited at publish time and recovered by administration, never by automatic regeneration at runtime.

---

## Publish rule

An AI-generated case **may** be published (for beta) only when:

- the image was successfully stored to the selected asset provider,
- the asset **reference is valid**,
- the asset is **verified**,
- the asset **manifest** exists (non-empty).

### For Telegram beta

- **Verification happens at asset-creation / publish time** — confirm the `file_id` reference is valid (`getFile`) during the build/publish gate.
- **Runtime does NOT verify on every replay.** Replay reuses stored references without re-verification (no per-replay provider/storage calls).
- If a runtime send fails because an asset reference is invalid:
  - mark the asset **suspect / unavailable** (no automatic regeneration at runtime),
  - an **admin/offline regeneration** is required,
  - regeneration that changes the canonical asset produces a **new immutable CaseVersion** (regen policy `docs/20-ai-generation-validation-contract.md` §20.19); the published version is never edited in place.

---

## No automatic byte fallback

- **Do NOT store image binary in Firestore** as a fallback.
- Do **NOT** rely on Gemini (or any provider) to produce a byte-identical replacement — generated images are non-deterministic, so a regenerated asset is a *different* asset.
- Therefore there is **no sound automatic byte fallback**. Recovery is manual/administrative and results in a new asset version (per the publish rule) when the canonical asset changes.

Rationale: keeping binary in Firestore violates the no-binary-in-Firestore invariant and reintroduces the cost/complexity the Firebase Storage upgrade would avoid; provider regeneration cannot reproduce an identical image.

---

## Architecture

Preserve the existing layering exactly — no domain knowledge of Telegram or Firebase:

```
Application
  → KontrakPenyimpananGambar   (simpan(kunci, obyek) → reference ; ada(reference) → boolean)
  → provider adapter           (TELEGRAM_BETA | FIREBASE_STORAGE | fake)
```

- The **domain never sees** `file_id`, Telegram, or Firebase details.
- The storage **provider is selected at wiring/composition time**, not in domain logic.
- The provider adapter produces a typed metadata record (`storageProvider`, `reference`, `durability`, `verifiedAt`, `status`) that flows into the existing `AsetVisual`/manifest persistence.
- Swapping `TELEGRAM_BETA → FIREBASE_STORAGE` is therefore an **adapter/composition change only**.

---

## Migration

`TELEGRAM_BETA → FIREBASE_STORAGE` is performed **without changes to**:

- CaseVersion semantic model,
- the Game Engine,
- CaseSession,
- Evidence,
- Proof,
- gameplay.

Migration is done at the **asset manifest / provider layer**:

1. For each asset in a case manifest under `TELEGRAM_BETA`, obtain the content (via the valid Telegram reference at migration time, or offline re-generation per asset policy) and upload it to Firebase Storage.
2. Rewrite the asset metadata: `storageProvider: FIREBASE_STORAGE`, `reference: gs://…`, `durability: DURABLE`, `verifiedAt`, `status: VERIFIED`.
3. Persist the updated manifest.
4. Publish a **new immutable CaseVersion** pointing at the migrated manifest (or migrate in place only for a non-published DRAFT with byte-identical content).
5. Verify the manifest is intact before publish (existing Part C publish gate).

Because the domain only consumes abstract references via `KontrakPenyimpananGambar`, the migration is invisible to the Game Engine and all session/evidence/proof/gameplay logic.

---

## Compare

### Why Firebase Storage remains the canonical target

- **Durability**: retention/SLA-backed durable object store; references are stable and trusted long-term.
- **Web / Mini App compatible**: stable HTTPS URL any web client can display directly — a Telegram `file_id` cannot.
- **Delete/regen-safe**: objects can be replaced/versioned without invalidating references under active gameplay.

### Why Telegram is an acceptable beta workaround

- **No Firebase upgrade required** for the beta.
- **Free** and works within the existing Telegram-native product (the bot already talks to the Bot API).
- Preserves all invariants: dedup key `caseId:sceneId:planId`, no runtime image regeneration, no binary in Firestore, immutable published CaseVersion, replay reuses the same reference, and the provider is **not called on cache hit**.
- Kept behind `KontrakPenyimpananGambar`, so it is swappable.

### Durability limitation

- `file_id`/vault media has **no retention SLA**; Telegram may silently flush media after inactivity or under abuse handling. This is `BEST_EFFORT`, not `DURABLE`.
- A reference can go stale; that is why metadata carries a durability class and the reference is verified at publish/asset-creation time.

### Mini App limitation

- A Telegram `file_id` is **not** usable by a web/Mini App client; browser rendering requires a server-proxied download behind a **new endpoint**, which is not allowed in this constraint set.
- Telegram vault = **Telegram-only** assets. Web/Mini App image support requires `FIREBASE_STORAGE` (or a permissible proxy) later.

### Recovery limitation

- We keep **no binary** (in Firestore or elsewhere) and providers are **non-deterministic**, so there is **no automatic byte fallback**.
- A dead `file_id` cannot be auto-healed at runtime. Recovery is administrative/offline (see procedure below).

### Operational procedure if a `file_id` stops working

1. **Detect** the failure at runtime `sendPhoto`: map to a send error, **log**, and **fail-soft** (skip the image, continue text gameplay — gameplay is never blocked).
2. **Mark** the asset `status = SUSPECT`/`UNAVAILABLE`; record `verifiedAt`/diagnostics. Do **not** regenerate automatically.
3. **Admin investigation**: verify whether the reference is genuinely invalid (re-run `getFile`) or a transient send error.
4. **Offline regeneration (if needed)**: regenerate the asset offline; if the canonical asset changes, publish a **new immutable CaseVersion** (regen policy §20.19). Never edit a published version in place.
5. **Optional migration trigger**: use the same path to migrate the case manifest `TELEGRAM_BETA → FIREBASE_STORAGE` (durability upgrade) when available.

---

## Final decision

```text
ASSET_STORAGE_BETA = TELEGRAM_BETA
ASSET_STORAGE_CANONICAL_TARGET = FIREBASE_STORAGE
FIREBASE_UPGRADE_REQUIRED_FOR_CANONICAL_STORAGE = YES
```

This is a decision record only. **No source code was changed; no dependency was installed.** Implementation is intentionally deferred until a separate build task.