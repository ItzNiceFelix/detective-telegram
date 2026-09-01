import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatWaktuIso, buatIdPemain } from "../../src/fondasi/primitif.js";
import { konfrontasikanBukti } from "../../src/domain/services/konfrontasi.js";
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

test("konfrontasikanBukti menolak evidence yang belum discovered", () => {
  const sesi = sesiDasar();
  assert.throws(
    () => konfrontasikanBukti(sesi, goldenCaseBible, "S01", "E04", buatWaktuIso("2026-01-01T01:00:00.000Z")),
    KesalahanValidasi,
  );
});

test("konfrontasikanBukti tanpa statement unlocked tidak menghasilkan kontradiksi (no softlock)", () => {
  const sesi = sesiDasar({ discoveredEvidenceIds: ["E04"] });
  const hasil = konfrontasikanBukti(sesi, goldenCaseBible, "S01", "E04", buatWaktuIso("2026-01-01T01:00:00.000Z"));

  assert.equal(hasil.kontradiksiBaruDitemukan, false);
  assert.equal(hasil.sesi, sesi);
});

test("konfrontasikanBukti dengan ST01 unlocked menghasilkan kontradiksi, unlock node, dan timeline", () => {
  const sesi = sesiDasar({ discoveredEvidenceIds: ["E04"], unlockedStatementIds: ["ST01"] });
  const hasil = konfrontasikanBukti(sesi, goldenCaseBible, "S01", "E04", buatWaktuIso("2026-01-01T01:00:00.000Z"));

  assert.equal(hasil.kontradiksiBaruDitemukan, true);
  assert.equal(hasil.contradictionId, "CONTRA_01");
  assert.ok(hasil.sesi.discoveredContradictionIds.includes("CONTRA_01"));
  assert.ok(hasil.sesi.unlockedDialogueIds.includes("NODE_CONFRONT_E04"));
  assert.ok(hasil.sesi.knownTimelineEventIds.includes("T02"));
});

test("konfrontasikanBukti duplicate tidak membuat instance kedua", () => {
  const waktu1 = buatWaktuIso("2026-01-01T01:00:00.000Z");
  const sesiSetelah = konfrontasikanBukti(
    sesiDasar({ discoveredEvidenceIds: ["E04"], unlockedStatementIds: ["ST01"] }),
    goldenCaseBible,
    "S01",
    "E04",
    waktu1,
  ).sesi;

  const hasilKedua = konfrontasikanBukti(sesiSetelah, goldenCaseBible, "S01", "E04", buatWaktuIso("2026-01-01T01:05:00.000Z"));

  assert.equal(hasilKedua.sudahDikonfrontasiSebelumnya, true);
  assert.equal(hasilKedua.sesi, sesiSetelah);
  assert.deepEqual(hasilKedua.sesi.discoveredContradictionIds, ["CONTRA_01"]);
});