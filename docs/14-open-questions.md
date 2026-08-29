# 14 — Open Questions / Decisions

Dokumen ini sekarang berfungsi sebagai **decision register**. Hal-hal yang sudah dikunci di bawah tidak lagi dianggap open question kecuali ada perubahan product-level.

## Locked decisions

### Product / gameplay

- Default closed-beta mode adalah cooperative shared investigation.
- Investigation dan inspection menghasilkan shared case knowledge; discovery credit tetap personal.
- Final accusation cooperative menggunakan satu active proposal, strict-majority vote, dan hanya satu final accusation attempt per session.
- Proposal dapat ditarik/diganti sebelum menjadi final.
- V1 memiliki satu canonical solution per case.
- Wrong final accusation mengakhiri session sebagai `CLEARED + FAILED`.
- Repeated/duplicate actions tidak menghasilkan unlimited reward.

### Domain

- `Case -> CaseVersion -> CaseSession` adalah hierarchy resmi.
- CaseVersion immutable setelah publish.
- Session lifecycle state: `LOBBY | OPEN | PAUSED | CLEARED | ARCHIVED`.
- `INACTIVE` dan `COLD` adalah derived status berbasis `lastActivityAt`.
- Evidence, statement, contradiction, timeline, causality, dan proof graph dipisahkan sebagai domain concepts.

### AI

- AI tidak authoritative untuk gameplay truth.
- Interrogation menggunakan hybrid deterministic engine + AI narrative renderer.
- Image generation berasal dari visual clue plan.
- Case generation mengikuti urutan truth -> logic -> evidence/proof -> dialogue -> narrative -> visuals -> validation -> publish.

## Masih open

### Product

- Durasi ideal satu case: 10–15 menit vs 30–60 menit.
- Apakah kategori non-murder masuk sejak beta atau setelah murder mystery stabil.
- Batas jumlah case awal untuk closed beta/open beta.

### Content & AI

- Provider text utama, image utama, dan fallback provider.
- Tingkat realisme visual final.
- Apakah setiap generated case memerlukan human review sebelum publish.
- Apakah AI Detective Assistant masuk closed beta atau fase berikutnya.

### Infrastructure

- Final Vercel deployment model.
- Firebase region.
- Final media storage provider.
- Mini App: closed beta atau post-beta.

### Moderation / community content

- Apakah user-generated case dibuka pada public open beta.
- Siapa yang boleh publish dan workflow moderation.

### Product economics

- Free scope saat beta.
- Premium case/content/creator features setelah product-market signal tersedia.

## Decision rule

Pertanyaan baru yang tidak memerlukan perubahan terhadap locked domain contract boleh diputuskan pada implementation design. Perubahan terhadap locked contract harus ditulis sebagai Architecture/Product Decision Record sebelum coding mengikutinya.


## v6 Resolution Notes

The AI generation architecture is now locked. Remaining open decisions should concern implementation/provider choices, not authority boundaries or case correctness rules.
