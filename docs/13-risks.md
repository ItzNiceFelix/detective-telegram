# 13 — Risks & Feasibility

## 13.1 Biggest product risk — gameplay tidak cukup seru

AI-generated content tidak otomatis berarti gameplay bagus. Risiko utama adalah puzzle terasa random, terlalu mudah, atau hanya menjadi aktivitas membaca.

**Mitigation:** buat kasus dengan deterministic puzzle structure, playtest awal, dan ukur discussion/participation rate.

## 13.2 Biggest technical risk — AI inconsistency

AI dapat menghasilkan dialog atau visual yang bertentangan dengan case truth.

**Mitigation:** Case Bible immutable + validator + AI hanya sebagai content renderer.

## 13.3 Biggest operational risk — image generation cost

Image generation berpotensi menjadi biaya dominan.

**Mitigation:** pre-generation, batching, asset reuse, provider abstraction, budget limits.

## 13.4 Telegram UX risk

Chat interface bisa terasa lambat/berantakan jika terlalu banyak pesan.

**Mitigation:** inline keyboard, edit message bila aman, compact responses, Mini App untuk board kompleks.

## 13.5 State complexity risk

Multiplayer session dapat menghasilkan race condition.

**Mitigation:** event ids, transactions/atomic writes, idempotency, state machine.

## 13.6 Free-tier risk

Quota vendor dapat berubah dan pola usage yang meningkat dapat membuat desain murah menjadi mahal.

**Mitigation:** cost counters, circuit breakers, quota-aware feature flags, pre-generated assets.

## 13.7 Abuse risk

User dapat memaksa bot menghasilkan konten ofensif atau menyerang orang nyata melalui custom cases.

**Mitigation:** moderation, fictional-first policy, reports, creator review, kill switch.

## 13.8 Content fatigue

Pemain bisa berhenti setelah beberapa kasus.

**Mitigation:** difficulty progression, seasons, replay modifiers, community cases, leaderboard.

## 13.9 Recommendation

Proyek **layak secara arsitektur** untuk dibangun pada serverless + Firebase jika prinsip determinism, batch AI generation, data minimization, dan quota protection dipatuhi.

Risiko terbesar bukan kemampuan backend, melainkan **quality of mystery design + AI content reliability + retention**.
