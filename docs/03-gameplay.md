# 03 — Gameplay & Game Mechanics

## 3.1 Core loop

```text
Start Case
  -> Briefing
  -> Inspect Crime Scene
  -> Discover Evidence
  -> Study Suspects
  -> Interrogate
  -> Build Timeline
  -> Compare Statements
  -> Form Theory
  -> Accuse
  -> Reveal Truth
  -> Score / XP / Achievements
```

## 3.2 Case state machine (LOCKED)

Persisted lifecycle state sengaja dibuat kecil:

```text
LOBBY
OPEN
PAUSED
CLEARED
ARCHIVED
```

`INACTIVE` dan `COLD` adalah **derived status**, bukan persisted lifecycle state. Keduanya dihitung dari `lastActivityAt`.

### 3.2.1 State semantics

| State | Arti | Gameplay mutation |
|---|---|---|
| `LOBBY` | Session dibuat, belum dimulai | Terbatas pada join/start/configuration |
| `OPEN` | Investigation aktif | Allowed |
| `PAUSED` | Investigation sengaja dihentikan | Tidak allowed |
| `CLEARED` | Session selesai | Tidak allowed |
| `ARCHIVED` | Session historical/non-active | Tidak allowed |

Outcome disimpan terpisah dari state:

```text
SOLVED
FAILED
TIMEOUT
ABANDONED
EXCEPTIONAL
```

Untuk v1, final accusation yang benar menghasilkan `CLEARED` dengan `SOLVED` atau `EXCEPTIONAL`; wrong final accusation menghasilkan `CLEARED` dengan `FAILED`.

### 3.2.2 Derived inactivity status

```text
state == OPEN
  + elapsed since lastActivityAt

< T1  -> ACTIVE
T1..T2 -> INACTIVE
> T2   -> COLD
```

Default awal dapat berupa `T1 = 2 hari` dan `T2 = 7 hari`, tetapi threshold configurable melalui feature flag. `PAUSED` selalu tetap `PAUSED` dan tidak berubah menjadi inactive/cold karena waktu.

### 3.2.3 Diagram transition

```text
LOBBY --start--> OPEN
OPEN --pause--> PAUSED
PAUSED --resume--> OPEN
OPEN --final resolution--> CLEARED
CLEARED --archive--> ARCHIVED
LOBBY --archive--> ARCHIVED
PAUSED --archive--> ARCHIVED
```

Inactivity tidak membutuhkan transition background. Saat session dibaca/interaksi, effective status dihitung secara lazy dari `lastActivityAt`.

### 3.2.4 Closed-beta group rule

Satu grup hanya memiliki satu session aktif secara operasional. Historical unresolved/cold sessions boleh tetap tercatat untuk recovery/continuation sesuai scope closed beta.

### 3.2.5 Lock contracts

**STATE-01** — Persisted session state hanya `LOBBY | OPEN | PAUSED | CLEARED | ARCHIVED`.

**STATE-02** — `INACTIVE` dan `COLD` adalah derived status.

**STATE-03** — Semua gameplay mutation hanya valid pada `OPEN`.

**STATE-04** — `CLEARED` adalah terminal gameplay state.

**STATE-05** — Gameplay-critical mutations harus idempotent dan concurrency-safe.

**STATE-06** — `case_events` adalah immutable audit/gameplay history; `case_sessions` menyimpan current aggregate.

## 3.3 Investigation (LOCKED)

Investigation adalah shared group action. Hasil discovery/inspection menjadi shared case state; individual discovery credit dicatat terpisah.

```text
INVESTIGATE = discovery layer
INSPECT     = examination layer
CREDIT      = personal attribution
```

Semua gameplay-relevant investigation result dapat dibaca oleh detective lain dan spectator melalui group interface. Private investigation state bukan default closed-beta mode.

## 3.3 Investigation

Pemain bisa:

- membuka scene;
- melihat visual;
- inspect object;
- collect evidence;
- membaca witness statement;
- memeriksa timeline;
- melihat hubungan antar elemen.

Action yang sama tidak boleh menghabiskan resource berulang kali kecuali memang dirancang demikian.

## 3.4 Evidence (LOCKED)

Evidence domain detail dan schema canonical ada di `15-case-bible-schema.md`.

Primitive yang dibedakan:

```text
Inspectable Object -> Observation -> Evidence -> Inference -> Theory
Statement -> Claim -> Contradiction -> Inference
```

Evidence lifecycle pemain:

```text
HIDDEN -> DISCOVERED -> EXAMINED
```

`truthStatus` dan `relevance` adalah atribut terpisah. Red herring dapat benar secara faktual tetapi tetap tidak relevan dengan solution.


## 3.5 Suspects (LOCKED)

Suspect profile berisi identity, relationship, occupation, motive, alibi, secrets, timeline references, statements, contradictions, dan evidence references. Suspect personality hanya memengaruhi narrative presentation, bukan canonical game state.

## 3.6 Interrogation (LOCKED)

Interrogation menggunakan hybrid architecture:

```text
Player input
  -> intent extraction
  -> deterministic game-engine validation
  -> dialogue node / semantic response
  -> AI narrative renderer
  -> response validation
```

AI tidak dapat menciptakan suspect, evidence, timeline, culprit, unlock condition, atau fakta baru. Bila AI gagal, deterministic fallback response menjaga gameplay tetap berjalan.

Evidence dapat membuka confrontation node terhadap statement tertentu.

## 3.7 Timeline & causality (LOCKED)

Timeline adalah graph of canonical events. Timestamp mendukung exact, approximate, range, dan unknown. Suspect statement/claim tetap dipisahkan dari canonical timeline event.

Setiap case memiliki causal chain dan proof graph. Solution harus memiliki tepat satu canonical solution dan setidaknya satu discoverable proof path. Generated case dengan multiple valid solutions, impossible timeline, actor-access violation, atau dead-end permanen ditolak validator.

## 3.8 Hint system (LOCKED)

Hint bertingkat:

- Tier 1: directional
- Tier 2: relationship
- Tier 3: evidence
- Tier 4: near-solution

Hint diarahkan oleh missing proof nodes; AI hanya merender wording. Hint count dibatasi pada level session/group agar cooperative difficulty tetap berarti.

## 3.9 Accusation

Accusation dapat menilai beberapa dimensi:

- culprit;
- motive;
- method;
- time;
- key evidence;
- escape/cover-up mechanism.

Score tidak hanya berdasarkan benar/salah culprit.

**Update — pemetaan ke status case (LOCKED):**

- Culprit benar + semua dimensi utama (motive, method, time) benar
  -> case menjadi `CLEARED` dengan outcome `SOLVED` dan resolution type `FULL`.
- Culprit benar tetapi satu atau lebih dimensi utama meleset
  -> case menjadi `CLEARED` dengan outcome `EXCEPTIONAL` dan resolution type `PARTIAL`.
- Culprit salah pada final accusation
  -> case menjadi `CLEARED` dengan outcome `FAILED`.

Final accusation hanya terjadi satu kali per session. Sebelum final accusation, grup
boleh membuat dan menarik kembali proposal accusation tanpa mengunci session.

Untuk menghindari dua model scoring/status yang bercampur, `CLEARED_ARREST` dan
`CLEARED_EXCEPTIONAL` yang pernah dipakai dalam draft sebelumnya **deprecated** sebagai
persisted state; outcome/resolution tersimpan terpisah dari lifecycle state.

## 3.12 Difficulty — Star Rating (BARU)

Tidak ada pemilihan difficulty oleh pemain saat memulai case. Rating ⭐ ditentukan
**otomatis saat case di-generate** (bagian dari Case Bible, bukan runtime random),
dari kombinasi faktor terukur — bukan angka acak murni:

```text
starScore = f(
  jumlah suspect dengan red herring valid,
  kedalaman interrogation branch menuju solusi,
  jumlah evidence yang harus dikombinasikan sebelum accuse valid,
  jumlah lapisan contradiction yang harus dibongkar
)

starRating = mapping(starScore) -> 1..5 bintang
```

Sifat penting:

- **Acak dari sudut pandang pemain** (tidak bisa dipilih, tidak diberitahu di awal),
  tapi **deterministik & terukur dari sudut pandang sistem** (dua case dengan struktur
  serupa akan mendapat rating yang konsisten, bukan hasil dadu murni).
- `starRating` dikunci saat case publish (immutable, sama seperti field lain di
  `cases/{caseId}` — lihat 06 — Data Model) dan **tidak ditampilkan ke pemain sebelum
  case dimulai**. Baru muncul setelah case dipilih untuk dimainkan, atau bahkan
  ditunda sampai reveal untuk efek dramatis (pilihan produk, lihat 14 — Open
  Questions).
- Dipakai untuk leaderboard/rank agency berbasis total ⭐ yang berhasil di-clear,
  bukan untuk menyaring pilihan case di awal.

## 3.10 Social mechanics

- group score;
- individual contribution;
- accusation proposal/vote;
- detective rank;
- agency XP;
- streak;
- achievements;
- case completion history.

## 3.11 Anti-spam gameplay rule

Action dengan biaya tinggi atau side effect tidak boleh dapat dieksploitasi melalui rapid repeat. Gunakan event idempotency + cooldown bila perlu.

## 3.13 Player / Group / Contribution / Scoring (LOCKED)

### 3.13.1 Multiplayer identity

```text
Group
  ├── Detective (active player)
  └── Spectator
```

A `Group` owns the social context and the active case session. A `Detective` is an
explicitly registered active player for that session. A `Spectator` can read shared
progress but cannot perform gameplay mutations in the closed beta. Maximum active
detectives per session: **6**.

### 3.13.2 Shared state vs personal attribution

Default cooperative mode has a single shared investigation state:

```text
discovered evidence
examined objects
unlocked dialogue
timeline knowledge
team theory
accusation proposal
case resolution
```

Personal records are attribution/progression only:

```text
discovery credit
contribution score
hints used
participation
career XP / achievements
```

There is no private shadow copy of evidence or timeline state in default co-op.

### 3.13.3 Contribution

A contribution represents **meaningful, first-time progress** attributable to a player.
Examples:

```text
EVIDENCE_DISCOVERY
CONTRADICTION_FOUND
CONFRONTATION_SUCCESS
THEORY_CONTRIBUTION
FINAL_RESOLUTION
```

The same logical contribution must not be rewarded twice. Contribution is linked to
the canonical source event/action through an idempotency key.

### 3.13.4 Score layers

There are two distinct score layers.

**Case score** evaluates the current investigation.

```text
base resolution score
+ bounded meaningful-contribution bonus
- hint penalty
- configured gameplay penalties
```

**Career progression** accumulates long-term progression:

```text
XP
rank
achievements
streak
case history
```

Career progression never determines the truth of a case.

### 3.13.5 Reward baseline

Illustrative tuning values for v1:

```text
first valid evidence discovery      +50
first useful contradiction          +75
successful confrontation            +100
meaningful theory contribution      +100
correct final resolution             +500
full-clear bonus                     +250
exceptional-clear bonus              +100
```

Exact numbers are configuration. The locked rule is that reward is for first meaningful
progress and contribution bonus has a hard cap.

### 3.13.6 Contribution eligibility

- First valid evidence discovery receives discovery credit.
- Repeat inspection of already examined content yields no additional reward.
- Repeated identical interrogation yields no additional reward unless a new node was unlocked.
- A newly unlocked useful dialogue node can yield contribution credit once.
- Confrontation yields credit only when it resolves a new contradiction or unlocks meaningful progress.
- Theory contribution requires a meaningful change or new proof relationship.
- Hint usage never gives positive points; it may reduce final score.
- Final resolution credit follows the session participation rules.

### 3.13.7 Accusation proposal

Before final accusation, an active detective may submit one shared accusation proposal at a time.
A new proposal can replace/withdraw the existing proposal before it becomes final. This
prevents proposal spam and keeps the group focused on one current hypothesis.

Default cooperative flow:

```text
PROPOSED
   ↓ detective votes
QUALIFIED
   ↓ confirmation
FINAL
   ↓ engine evaluation
RESOLVED
```

Default quorum is a **strict majority** of active detectives, except a solo detective:

```text
active = 1  → quorum 1
active >= 2 → quorum floor(active / 2) + 1
```

A spectator cannot vote. A detective can change their proposal vote before qualification.

### 3.13.8 Final accusation

Exactly one final accusation is permitted per session. It evaluates the configured
solution dimensions (culprit, motive, method, time, key evidence, and optional escape/cover-up).

```text
correct culprit + main dimensions correct
  → CLEARED / SOLVED / FULL

correct culprit + incomplete/wrong main dimensions
  → CLEARED / EXCEPTIONAL / PARTIAL

wrong culprit
  → CLEARED / FAILED
```

A wrong final accusation is terminal. There is no second final accusation attempt.

### 3.13.9 Group score vs individual score

The group score is bounded and reflects the quality of the case result. Individual score
records contribution attribution but must not be allowed to dominate resolution correctness.

Therefore:

```text
group score != sum(all Telegram messages)
group score != unlimited sum(individual rewards)
```

A group with more spectators does not gain score. Adding active detectives can provide
more opportunities for contribution, but the contribution bonus is capped.

### 3.13.10 Anti-farming

The following must not generate unlimited progression:

- repeated inspect;
- repeated identical questions;
- repeated proposal/withdraw cycles;
- repeated button callbacks;
- duplicate webhook delivery.

Action processing and reward application must use idempotency.

### 3.13.11 Concurrency

Score, contribution, proposal qualification, and final accusation mutations are transactional.
If two final-confirm actions race, exactly one can commit as the final accusation.

### 3.13.12 Locked contracts

**SCORE-01** — Default co-op uses one shared gameplay state; personal state is attribution/progression.

**SCORE-02** — Contribution is meaningful-first-progress attribution, not message count.

**SCORE-03** — Reward-bearing mutations are idempotent.

**SCORE-04** — Group score is bounded.

**SCORE-05** — There is at most one active accusation proposal at a time in a session.

**SCORE-06** — Exactly one final accusation is allowed per session.

**SCORE-07** — Wrong final accusation ends the session as `CLEARED + FAILED`.

**SCORE-08** — Default cooperative quorum is strict majority; solo detective quorum is one.

**SCORE-09** — Spectators cannot contribute gameplay votes or mutations.

**SCORE-10** — Career progression consumes canonical gameplay events, never raw chat volume.
