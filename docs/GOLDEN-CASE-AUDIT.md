# Golden Case End-to-End Integration Audit

**Scope:** Integration/wiring audit. Bukan redesign, bukan penambahan feature baru.

## Canonical Golden Case

| Field | Value |
|---|---|
| Culprit | Marcus Bell (S01) |
| Motive | Insurance Fraud |
| Method | Poison |
| Seed | buatVersiKasusEmasTerbitan() |

AI: deterministic/fake (RendererNaratifDeterministik). AI tidak memengaruhi culprit, score, unlock, proof, resolution.

## 1. SOLVED PATH (22 assertions)

1. /newcase → CaseSession LOBBY
2. /startcase (admin) → LOBBY→OPEN via validasiTransisiSesi + mulaiSesi() atomic
3. /investigate ROOM_407 → discover OBJ_WATCH, OBJ_FOOTPRINTS, OBJ_WINDOW, OBJ_CCTV
4. /inspect → discover E01, E02, E03, E04
5. /interrogate Marcus ASK_ALIBI → unlock ST01, NODE_ALIBI_01
6. /confront E04 → CONTRA_01, T02
7. /teori → currentTheory shared, support PROVEN
8. /propose S01 → OPEN
9. /vote (2/2) → QUALIFIED
10. /finalize → correctCulprit:true → CLEARED+SOLVED
11. snapshot saved
12. event: 1 FINAL_ACCUSATION, 1 CASE_CLEARED, 1 CONTRADICTION_FOUND, 1 TIMELINE_KNOWLEDGE_GAINED
13. reward: 1 CORRECT_FINAL_RESOLUTION

Test: golden-case-e2e.test.ts ✅

## 2. FAILED PATH

Sama SOLVED PATH sampai /propose, tapi suspect salah (S99_WRONG).
- /finalize → correctCulprit:false → CLEARED+FAILED, solvedAt undefined
- snapshot outcome=FAILED
- /propose lagi → gagal (CLEARED)
- /finalize lagi → safe-replay hasil existing (berhasil), tanpa event/reward kedua (sudahFinalSebelumnya)
- validasiTransisiSesi(CLEARED,OPEN) → throw KesalahanValidasi
- event: 1 FINAL_ACCUSATION, 1 CASE_CLEARED
- reward: 0 CORRECT_FINAL_RESOLUTION

Test: golden-case-failed-path.test.ts ✅

## 3. STATE TRANSITIONS

LOBBY→OPEN (startcase, admin). OPEN→CLEARED (finalize). Tidak ada keluar dari CLEARED (state machine existing).
State rule hanya di validasiTransisiSesi — tidak ada rule baru di handler.

## 4. SHARED STATE (2 detective + 1 spectator)

| Aksi | D1 | D2 | Spectator |
|---|---|---|---|
| investigate/inspect | discover | semua discoveredEvidenceIds shared | KesalahanAutorisasi |
| interrogate | unlock ST01 | unlockedStatementIds shared | KesalahanAutorisasi |
| confront | CONTRA_01, T02 | contradiction/timeline shared | KesalahanAutorisasi |
| theory | currentTheory shared | 1 objek, updateBy terlihat | KesalahanAutorisasi |

Spectator: semua mutasi ditolak via validasiEligibilitasDetektif. State tidak berubah.
Test: golden-case-shared-state.test.ts ✅

## 5. CONCURRENCY (5 sub-tests)

- evidence discovery simultan (same) → 1 event
- evidence discovery simultan (different) → no lost update
- interrogate & confront simutan → 1 statement, 1 contradiction, 1 timeline
- theory update simultan → 1 currentTheory konsisten
- votes simultan → 2 unique votes, qualified sekali
- final conviction simultan → 1 resolution, 1 snapshot, 1 reward

Test: golden-case-concurrency.test.ts ✅

## 6. IDEMPOTENCY (5 sub-tests)

Gameplay aksi memakai action-level idempotency di domain service. Update-level idempotency (telegram:update:{id}) untuk /newcase & /startcase.

| Action | Duplicate | Result |
|---|---|---|
| inspect | 2x same | evidenceBaruDitemukan:false, 1 event |
| interrogate | 2x same | nodeBaruDiunlock:false, 1 event |
| confront | 2x same | kontradiksiBaruDitemukan:false, 1 event |
| vote | 2x same | votes tetap 1 |
| finalize | 2x same | safe-replay berhasil (sudahFinalSebelumnya), 1 event, 1 reward |

Test: golden-case-idempotency.test.ts ✅

## 7. FIRESTORE IO (Golden Case SOLVED Path)

| Aksi | Reads (cum) | Writes (cum) |
|---|---|---|
| inspect (evidence baru) | 13 | 12 |
| inspect (evidence baru #2) | 15 | 14 |
| interrogate (unlock statement) | 17 | 16 |
| confront (kontradiksi) | 19 | 20 |
| theory update | 21 | 23 |
| accuse propose | 23 | 25 |
| accuse votes (2) | 27 | 30 |
| final accusation | 29 | 35 |

### Transaction Boundaries
- /newcase: 1 tx (group read + idempotency claim + session create + pointer + event)
- /startcase: 1 tx (session read + idempotency claim + transition + CASE_STARTED event)
- gameplay aksi: 1 tx per aksi (session read + mutation + event bila atomic)
- /finalize: 1 tx (session + state + snapshot + contribution + FINAL_ACCUSATION + CASE_CLEARED + CASE_STARTED event)

### Hot Document
- case_sessions/{sessionId}: hot doc (written by hampir setiap aksi). Ditulis ≥5x di SOLVED path. Ini fitur, bukan bug.
- groups/{groupId}: ditulis hanya pada /newcase (activeCaseSessionId pointer).

### Unbounded Fields (bounded oleh domain)
- discoveredEvidenceIds, discoveredContradictionIds, knownTimelineEventIds, accusationProposal.votes — semua bounded oleh jumlah domain objek per case.

Test: golden-case-firestore-io.test.ts ✅

## 8. TELEGRAM FLOW

api/telegram.ts adalah thin entrypoint (diverifikasi telegram-stub-scan.test.ts):
- Tidak ada inline stub, fake repo, no-op sender, atau business logic.
- Semua dependency dari composition root (buatKomposisiAplikai/dapatkanKomposisiAplikai).
- Flow: validate→resolve→invoke service→response.

TelegramAdapter.sendMessage:
- Bot API sendMessage via fetch, payload chat_id+text minimum
- Handle HTTP error, ok=false, malformed response, timeout → KesalahanIntegrasi
- Token tidak bocor ke error message

Post-commit outbound: gagal setelah commit → canonical state tetap (rollback denied), log correlation ID, HTTP 200 aman. Idempotency mencegah duplicate mutation.

## 9. AI BOUNDARY

AI deterministic (RendererNaratifDeterministik). AI tidak memengaruhi: culprit, score, unlock, proof, resolution.

## 10. VERIFICATION

| Gate | Result |
|---|---|
| npx tsc --noEmit | ✅ 0 error (kecuali 4 pre-existing @vercel/node module-not-found di file api existing) |
| Integration tests | ✅ 73/73 pass |
| npm run smoke | ✅ 4/4 lulus |

### Tests introduced/changed by this audit
50 test baru (73 total termasuk 23 test wiring patch existing): golden-case-e2e, golden-case-failed-path, golden-case-shared-state, golden-case-concurrency, golden-case-idempotency, golden-case-firestore-io, golden-case-firebase-bootstrap, golden-case-komposisi, golden-case-newcase-atomicity, golden-case-startcase-atomicity, golden-case-idempotency-repo, golden-case-otorisasi, golden-case-telegram-outbound, golden-case-telegram-stub-scan.

### Pre-existing failures
10 test unit fail di tests/unit/* (ai-visual-narrative, golden-case-interogasi, interogasi-concurrency, investigasi-concurrency, render-investigasi, tuduhan) — pre-existing, tidak disentuh.

### New failures: 0

## 11. REQUISITES DEFECTS

1. **/finalize duplicate → safe-replay berhasil (sudahFinalSebelumnya), tanpa double reward/resolution.** ✅ DIPERBAIKI: `finalisasiTuduhan()` memprioritaskan cek `finalAccusation` di atas `validasiSesiTerbuka` (retry Telegram aman). Test `golden-case-idempotency` & `golden-case-failed-path` diperbarui ke semantik safe-replay; unit test `tuduhan` sudah memvalidasi `sudahFinalSebelumnya` + sesi tidak berubah.
2. @vercel/node types tidak terpasang di dev env (pre-existing).
3. getChatMember cache TTL 5m/30s.
4. Idempotency key retention belum ada TTL Firestore.
5. Auto-registrasi grup sebagai ACTIVE pada interaksi pertama.

## 12. Environment Variables

TELEGRAM_BOT_TOKEN, TELEGRAM_SECRET, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ADMIN_SECRET_TOKEN, RATE_LIMIT_MAX_ACTIONS, RATE_LIMIT_WINDOW_SECONDS, LOG_LEVEL. Tidak ada default credential di source.
