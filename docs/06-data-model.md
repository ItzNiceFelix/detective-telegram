# 06 — Data Model & Firebase

## 6.1 Collection overview

```text
users/
groups/
cases/
case_sessions/
case_events/
player_stats/
group_stats/
achievements/
leaderboards/
feature_flags/
moderation_cases/
reports/
```

## 6.2 users/{userId}

```text
telegramUserId
usernameSnapshot
language
createdAt
lastActiveAt
settings
```

Jangan menjadikan username sebagai primary key karena dapat berubah.

## 6.3 groups/{groupId}

```text
telegramChatId
createdAt
settings
owner/admin metadata
status
activeCaseSessionId
```

## 6.4A CaseVersion / immutable content boundary

Case gameplay harus mengarah ke snapshot immutable. Secara logical domain:

```text
cases/{caseId}
  -> versions/{caseVersionId}
```

Version menyimpan `schemaVersion`, `contentHash`, canonical Case Bible, media manifest, dan publish metadata. Perubahan truth substantif membuat version baru.

`CaseSession` **tidak** memodifikasi CaseVersion.

## 6.4 cases/{caseId}

Case immutable setelah publish, kecuali metadata administratif.

```text
schemaVersion
status
version
title
difficulty          # deprecated label — lihat starRating
starRating           # 1-5, dihitung deterministik saat generate, immutable setelah publish
starScoreBreakdown   # opsional: komponen perhitungan, untuk audit/tuning generator
tags
briefing
victim
suspects
locations
evidence
timeline
interrogationGraph
solution
scoring
mediaRefs
safetyMetadata
createdAt
publishedAt
```

`starRating` tidak boleh diserahkan ke client (bot response ke player) sebelum case
dimulai — lihat 03-gameplay.md 3.12.

## 6.5 case_sessions/{sessionId}

```text
caseId
caseVersionId
groupId
status             # LOBBY | OPEN | PAUSED | CLEARED | ARCHIVED
outcome            # null | SOLVED | FAILED | TIMEOUT | ABANDONED | EXCEPTIONAL
playerIds          # max 6 in closed beta
startedAt
updatedAt
lastActivityAt
pausedAt
pausedBy
currentScene
discoveredEvidence
examinedObjects
unlockedSuspects
unlockedDialogue
teamTheory
accusationProposal
finalAccusation
contributors
score
solvedAt
archivedAt
```

`INACTIVE` dan `COLD` tidak disimpan sebagai lifecycle state. Effective status dihitung dari `lastActivityAt` saat read/interaction.

`caseVersionId` wajib menunjuk ke immutable published CaseVersion.

`playerIds` adalah access-control list untuk callback gameplay pada closed beta. Spectator dapat membaca public/shared progress tetapi tidak melakukan gameplay mutation.

## 6.5.1 Shared vs personal progress

Shared session state:

```text
discoveredEvidence
examinedObjects
unlockedDialogue
teamTheory
timeline knowledge
accusationProposal
finalAccusation
score
```

Personal aggregate / attribution:

```text
player_stats / contribution records
discovery credit
individual score contribution
hints used
participation metadata
```

Default closed-beta cooperative mode does not maintain private copies of evidence or
timeline state.

## 6.5.2 Contribution records

Contribution records may be stored as a subcollection or compact per-session aggregate,
depending on query needs:

```text
case_sessions/{sessionId}/contributions/{contributionId}
```

Each contribution references its canonical source event and idempotency key. This prevents
duplicate rewards when Telegram/webhook delivery retries.

## 6.5.3 Accusation proposal

The session stores at most one active proposal:

```text
accusationProposal
├── proposalId
├── proposedBy
├── suspectId
├── dimensions
├── votes
├── status             # PROPOSED | QUALIFIED | WITHDRAWN | FINAL
├── createdAt
└── qualifiedAt
```

Only active detectives may vote. Finalization and score effects are transactional.

## 6.6 case_events/{eventId}

```text
sessionId
groupId
userId
type
payload
timestamp
idempotencyKey
```

Retention dapat dibatasi. Tidak perlu menyimpan semua event selamanya.

## 6.7 player_stats

Simpan agregat yang dibutuhkan untuk leaderboard.

## 6.8 Data minimization

Bot tidak perlu menyimpan seluruh isi percakapan grup. Hanya simpan state/event yang dibutuhkan game.

## 6.9 Indexing strategy

Index dirancang berdasarkan query nyata:

- active sessions by group;
- leaderboard by score/XP;
- events by session and timestamp;
- cases by status/difficulty/tag.

Hindari query scan besar.

## 6.10 Firebase design principle

Firestore dipakai untuk **small state + transactional metadata**, bukan sebagai chat archive atau media warehouse.
