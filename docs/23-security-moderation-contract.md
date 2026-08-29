# 23 — Security, Safety & Moderation Contract

## Status
LOCKED

## 23.1 Trust boundary

All Telegram input, callback payloads, Mini App input, AI output, and user-created case content are untrusted.

## 23.2 Authentication / authorization

- Validate Telegram webhook secret token.
- Validate Telegram user/chat identifiers server-side.
- Resolve roles from Firestore, never from callback payload.
- Admin actions require explicit server-side admin membership.
- Mini App requests require Telegram init-data verification.

## 23.3 Abuse controls

Per-user and per-group limits cover:

- actions per minute;
- accusations;
- hints;
- interrogation spam;
- malformed callbacks;
- oversized input;
- repeated AI requests.

Rate-limit rejection must not consume gameplay resources or rewards.

## 23.4 Content safety

Default case content is fictional. User-provided names/details should not be treated as real criminal allegations. The product must not present accusations as factual claims about real people.

Case-generation and user-case publication pipelines include moderation gates for:

- real-person targeting;
- hateful or abusive content;
- sexual or exploitative content;
- graphic gore beyond the product's allowed rating;
- illegal instruction content;
- harassment / doxxing.

## 23.5 Image policy

Generated crime scenes are fictional game assets. The visual generation specification must prohibit recognizable depictions of real people unless a separately approved use case exists.

## 23.6 Prompt injection

Case Bible fields are structured data, not trusted instructions to the AI renderer. Player text must never be directly concatenated into system-level generation prompts.

Use:

```text
trusted system policy
+ validated case facts
+ bounded player intent
```

## 23.7 Auditability

Security-sensitive events are logged with:

- event ID;
- session ID;
- actor ID;
- action type;
- result;
- timestamp;
- failure code when applicable.

No raw secrets or provider credentials are logged.
