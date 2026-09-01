import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { periksaObjek } from "../../src/domain/services/investigasi.js";
import { interogasiTersangka } from "../../src/domain/services/interogasi.js";
import { konfrontasikanBukti } from "../../src/domain/services/konfrontasi.js";
import { evaluasiGrafPembuktian } from "../../src/domain/services/graf-pembuktian.js";
import { RendererNaratifDeterministik } from "../../src/domain/services/renderer-naratif.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

test("Golden Case E2E: investigate -> discover E04 -> interrogate -> confront -> contradiction -> proof", () => {
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
  const renderer = new RendererNaratifDeterministik();
  let waktu = buatWaktuIso("2026-01-01T01:00:00.000Z");

  // discover E04
  const hasilCCTV = periksaObjek(sesi, goldenCaseBible, "OBJ_CCTV", pemain, waktu);
  assert.equal(hasilCCTV.evidenceId, "E04");
  assert.equal(hasilCCTV.evidenceBaruDitemukan, true);
  sesi = hasilCCTV.sesi;

  // interrogate Marcus -> ST01
  waktu = buatWaktuIso("2026-01-01T01:05:00.000Z");
  const hasilInterogasi = interogasiTersangka(sesi, goldenCaseBible, renderer, "S01", "ASK_ALIBI", pemain, waktu);
  assert.ok(hasilInterogasi.sesi.unlockedStatementIds.includes("ST01"));
  sesi = hasilInterogasi.sesi;

  // confront Marcus with E04 -> contradiction
  waktu = buatWaktuIso("2026-01-01T01:10:00.000Z");
  const hasilKonfrontasi = konfrontasikanBukti(sesi, goldenCaseBible, "S01", "E04", waktu);
  assert.equal(hasilKonfrontasi.kontradiksiBaruDitemukan, true);
  assert.equal(hasilKonfrontasi.contradictionId, "CONTRA_01");
  sesi = hasilKonfrontasi.sesi;

  assert.ok(sesi.knownTimelineEventIds.includes("T02"), "timeline update");
  assert.ok(sesi.unlockedDialogueIds.includes("NODE_CONFRONT_E04"), "updated statement node unlocked");

  // interrogate again -> reach the post-confrontation node, unlocking ST02
  waktu = buatWaktuIso("2026-01-01T01:15:00.000Z");
  const hasilInterogasi2 = interogasiTersangka(sesi, goldenCaseBible, renderer, "S01", "CONFRONT_EVIDENCE", pemain, waktu);
  assert.equal(hasilInterogasi2.responseText, "Alright... I came back. I was here at 23:10.");
  sesi = hasilInterogasi2.sesi;
  assert.ok(sesi.unlockedStatementIds.includes("ST02"), "Marcus changes story");

  // proof support
  const statusBukti = evaluasiGrafPembuktian(sesi, goldenCaseBible, "PROOF_MARCUS_PRESENT");
  assert.equal(statusBukti, "PROVEN");
});