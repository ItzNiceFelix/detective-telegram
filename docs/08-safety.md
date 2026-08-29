# 08 — Moderation, Safety & Abuse Prevention

## 8.1 Product safety posture

Produk menggunakan tema kriminal fiksi. Konten harus dirancang untuk hiburan misteri, bukan untuk menuduh atau menginvestigasi orang nyata.

## 8.2 Default restrictions

- Suspects fiksi.
- Victims fiksi.
- Nama nyata bukan target default.
- Tidak ada real-world accusation mechanic.
- Tidak ada doxxing.
- Tidak ada personal data enrichment.

## 8.3 Generated content moderation

Setiap generated case harus melewati policy/content checks sebelum publish.

Minimal menolak/flag:

- pornographic content;
- graphic gore yang tidak perlu;
- hateful content;
- harassment-targeting content;
- instructions for real-world violent wrongdoing;
- real-person defamatory framing.

## 8.4 Group abuse controls

- per-user cooldown;
- command rate limit;
- duplicate callback handling;
- max active sessions per group;
- admin-only configuration;
- report action;
- mute/denylist support;
- kill switch untuk case.

## 8.5 Creator moderation

Community cases harus memiliki:

- owner;
- moderation status;
- report count;
- takedown state;
- immutable version reference.

## 8.6 Auditability

Admin action kritis harus menghasilkan audit event:

```text
CASE_DISABLED
USER_BLOCKED
GROUP_DISABLED
CASE_PUBLISHED
CASE_ROLLED_BACK
```
