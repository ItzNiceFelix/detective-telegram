import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatWaktuIso, buatIdPemain } from "../../src/fondasi/primitif.js";
import { evaluasiGrafPembuktian } from "../../src/domain/services/graf-pembuktian.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

function sesiDasar(overrides: Partial<SesiKasus> = {}): SesiKasus {
  return {
    sessionId: "session-1" as any,
    caseId: "CASE-001" as any,
    caseVersionId: "v-1" as any,
    groupId: "group-1" as any,
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    ...overrides,
  };
}

test("evaluasiGrafPembuktian UNSUPPORTED tanpa discovered knowledge", () => {
  const hasil = evaluasiGrafPembuktian(sesiDasar(), goldenCaseBible, "PROOF_MARCUS_PRESENT");
  assert.equal(hasil, "UNSUPPORTED");
});

test("evaluasiGrafPembuktian PLAUSIBLE dengan sebagian required edge terpenuhi", () => {
  const sesi = sesiDasar({ discoveredEvidenceIds: ["E04"] });
  const hasil = evaluasiGrafPembuktian(sesi, goldenCaseBible, "PROOF_MARCUS_PRESENT");
  assert.equal(hasil, "PLAUSIBLE");
});

test("evaluasiGrafPembuktian PROVEN ketika semua required edge terpenuhi", () => {
  const sesi = sesiDasar({ discoveredEvidenceIds: ["E04"], knownTimelineEventIds: ["T02"] });
  const hasil = evaluasiGrafPembuktian(sesi, goldenCaseBible, "PROOF_MARCUS_PRESENT");
  assert.equal(hasil, "PROVEN");
});

test("evaluasiGrafPembuktian node tidak dikenal mengembalikan UNSUPPORTED", () => {
  const hasil = evaluasiGrafPembuktian(sesiDasar(), goldenCaseBible, "NODE_TIDAK_ADA");
  assert.equal(hasil, "UNSUPPORTED");
});