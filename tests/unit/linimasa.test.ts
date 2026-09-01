import test from "node:test";
import assert from "node:assert/strict";

import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { validasiRelasiKausal, ambilPeristiwaLinimasa } from "../../src/domain/services/linimasa.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { buatWaktuIso, buatIdPemain } from "../../src/fondasi/primitif.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

test("validasiRelasiKausal menerima Golden Case tanpa cycle", () => {
  assert.doesNotThrow(() => validasiRelasiKausal(goldenCaseBible.causalRelations));
});

test("validasiRelasiKausal menolak cycle ilegal pada dependency chain", () => {
  assert.throws(
    () =>
      validasiRelasiKausal([
        { dari: "A", ke: "B", jenis: "REQUIRES" },
        { dari: "B", ke: "C", jenis: "REQUIRES" },
        { dari: "C", ke: "A", jenis: "REQUIRES" },
      ]),
    KesalahanValidasi,
  );
});

test("validasiRelasiKausal mengizinkan CONTRADICTS membentuk 'cycle' (bukan dependency)", () => {
  assert.doesNotThrow(() =>
    validasiRelasiKausal([
      { dari: "A", ke: "B", jenis: "CONTRADICTS" },
      { dari: "B", ke: "A", jenis: "CONTRADICTS" },
    ]),
  );
});

test("ambilPeristiwaLinimasa hanya mengembalikan event yang known", () => {
  const sesi: SesiKasus = {
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
    knownTimelineEventIds: ["T02"],
  };

  const hasil = ambilPeristiwaLinimasa(sesi, goldenCaseBible);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0]?.eventId, "T02");
});