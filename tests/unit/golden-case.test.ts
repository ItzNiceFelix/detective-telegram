import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { selidikiAdegan, periksaObjek } from "../../src/domain/services/investigasi.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

test("Golden Case: OPEN -> investigate -> inspect semua object -> evidence sesuai spesifikasi", () => {
  let sesi: SesiKasus = {
    sessionId: "session-golden" as any,
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
  };

  const pemain = buatIdPemain("user-1");
  let waktu = buatWaktuIso("2026-01-01T01:00:00.000Z");

  const investigasi = selidikiAdegan(sesi, goldenCaseBible, "ROOM_407");
  assert.ok(investigasi.objekTampak.map((o) => o.objectId).includes("OBJ_WATCH"));

  const hasilWatch = periksaObjek(sesi, goldenCaseBible, "OBJ_WATCH", pemain, waktu);
  assert.equal(hasilWatch.evidenceId, "E01");
  assert.equal(hasilWatch.evidenceBaruDitemukan, true);
  sesi = hasilWatch.sesi;

  waktu = buatWaktuIso("2026-01-01T01:05:00.000Z");
  const hasilFootprints = periksaObjek(sesi, goldenCaseBible, "OBJ_FOOTPRINTS", pemain, waktu);
  assert.equal(hasilFootprints.evidenceId, "E02");
  assert.equal(hasilFootprints.evidenceBaruDitemukan, true);
  sesi = hasilFootprints.sesi;

  waktu = buatWaktuIso("2026-01-01T01:10:00.000Z");
  const hasilWindow = periksaObjek(sesi, goldenCaseBible, "OBJ_WINDOW", pemain, waktu);
  assert.equal(hasilWindow.evidenceId, "E03");
  assert.equal(hasilWindow.evidenceBaruDitemukan, true);
  sesi = hasilWindow.sesi;

  // Wine Glass sekarang visible karena E03 sudah discovered.
  const investigasiUlang = selidikiAdegan(sesi, goldenCaseBible, "ROOM_407");
  assert.ok(investigasiUlang.objekTampak.map((o) => o.objectId).includes("OBJ_WINEGLASS"));

  waktu = buatWaktuIso("2026-01-01T01:15:00.000Z");
  const hasilWineglass = periksaObjek(sesi, goldenCaseBible, "OBJ_WINEGLASS", pemain, waktu);
  assert.equal(hasilWineglass.evidenceId, undefined, "Wine Glass tidak menghasilkan critical evidence");
  assert.equal(hasilWineglass.evidenceBaruDitemukan, false);
  sesi = hasilWineglass.sesi;

  waktu = buatWaktuIso("2026-01-01T01:20:00.000Z");
  const hasilDesk = periksaObjek(sesi, goldenCaseBible, "OBJ_DESK", pemain, waktu);
  assert.equal(hasilDesk.evidenceId, undefined, "Desk tidak menghasilkan critical evidence");
  sesi = hasilDesk.sesi;

  assert.deepEqual(sesi.discoveredEvidenceIds.sort(), ["E01", "E02", "E03"]);
  assert.deepEqual(
    sesi.examinedObjectIds.sort(),
    ["OBJ_DESK", "OBJ_FOOTPRINTS", "OBJ_WATCH", "OBJ_WINDOW", "OBJ_WINEGLASS"].sort(),
  );
});