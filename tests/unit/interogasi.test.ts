import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { normalisasiMaksud, interogasiTersangka } from "../../src/domain/services/interogasi.js";
import { RendererNaratifDeterministik } from "../../src/domain/services/renderer-naratif.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

const renderer = new RendererNaratifDeterministik();

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

test("normalisasiMaksud memetakan kata kunci alibi", () => {
  assert.equal(normalisasiMaksud("what's your alibi"), "ASK_ALIBI");
});

test("normalisasiMaksud melempar error untuk input tidak dikenali", () => {
  assert.throws(() => normalisasiMaksud("xyzxyz random"), KesalahanValidasi);
});

test("interogasiTersangka menolak jika sesi tidak OPEN", () => {
  const sesi = sesiDasar({ status: StatusSesi.LOBBY });
  assert.throws(
    () => interogasiTersangka(sesi, goldenCaseBible, renderer, "S01", "ASK_ALIBI", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z")),
    KesalahanValidasi,
  );
});

test("interogasiTersangka ASK_ALIBI mengunlock NODE_ALIBI_01 dan ST01", () => {
  const sesi = sesiDasar();
  const hasil = interogasiTersangka(sesi, goldenCaseBible, renderer, "S01", "ASK_ALIBI", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z"));

  assert.equal(hasil.node.nodeId, "NODE_ALIBI_01");
  assert.equal(hasil.nodeBaruDiunlock, true);
  assert.equal(hasil.statementBaruDiunlock, true);
  assert.ok(hasil.sesi.unlockedStatementIds.includes("ST01"));
  assert.equal(hasil.responseText, "I left at 22:30.");
});

test("interogasiTersangka repeated tidak memberi unlock tambahan", () => {
  const waktu1 = buatWaktuIso("2026-01-01T01:00:00.000Z");
  const sesiSetelah = interogasiTersangka(sesiDasar(), goldenCaseBible, renderer, "S01", "ASK_ALIBI", buatIdPemain("user-1"), waktu1).sesi;

  const hasilKedua = interogasiTersangka(sesiSetelah, goldenCaseBible, renderer, "S01", "ASK_ALIBI", buatIdPemain("user-2"), buatWaktuIso("2026-01-01T01:05:00.000Z"));

  assert.equal(hasilKedua.sudahDiunlockSebelumnya, true);
  assert.equal(hasilKedua.sesi, sesiSetelah);
});

test("CONFRONT_EVIDENCE node terkunci sampai ST01 unlocked", () => {
  const sesi = sesiDasar();
  assert.throws(
    () => interogasiTersangka(sesi, goldenCaseBible, renderer, "S01", "CONFRONT_EVIDENCE", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z")),
    KesalahanValidasi,
  );
});