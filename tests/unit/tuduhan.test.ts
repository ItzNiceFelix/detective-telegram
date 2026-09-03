import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi, HasilSesi } from "../../src/domain/enums.js";
import { KesalahanAutorisasi, KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { ajukanTuduhan, berikanSuaraTuduhan, finalisasiTuduhan, hitungKuorum } from "../../src/domain/services/tuduhan.js";
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
    playerIds: [buatIdPemain("user-1"), buatIdPemain("user-2"), buatIdPemain("user-3")],
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

test("hitungKuorum sesuai tabel: 1->1, 2->2, 3->2, 4->3, 5->3, 6->4", () => {
  assert.equal(hitungKuorum(1), 1);
  assert.equal(hitungKuorum(2), 2);
  assert.equal(hitungKuorum(3), 2);
  assert.equal(hitungKuorum(4), 3);
  assert.equal(hitungKuorum(5), 3);
  assert.equal(hitungKuorum(6), 4);
});

test("ajukanTuduhan menolak dari spectator", () => {
  // Spectator bukan detective aktif → ditolak sebagai pelanggaran otorisasi
  // (KesalahanAutorisasi), konsisten dengan golden-case contract dan seluruh
  // aksi mutasi lain (investigate/interrogate/confront/theory).
  assert.throws(() => ajukanTuduhan(sesiDasar(), "spectator-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")), KesalahanAutorisasi);
});

test("vote duplicate tidak menambah suara kedua", () => {
  const sesi = sesiDasar();
  const p = ajukanTuduhan(sesi, "user-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  const v1 = berikanSuaraTuduhan(p, "user-1", buatWaktuIso("2026-01-01T01:01:00.000Z"));
  const v2 = berikanSuaraTuduhan(v1.sesi, "user-1", buatWaktuIso("2026-01-01T01:02:00.000Z"));
  assert.equal(v2.suaraBaru, false);
  assert.equal(v2.proposal.votes.length, 1);
});

test("proposal qualified pada strict majority (3 aktif -> kuorum 2)", () => {
  const sesi = sesiDasar();
  let s = ajukanTuduhan(sesi, "user-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  const v1 = berikanSuaraTuduhan(s, "user-1", buatWaktuIso("2026-01-01T01:01:00.000Z"));
  assert.equal(v1.proposal.status, "OPEN");
  const v2 = berikanSuaraTuduhan(v1.sesi, "user-2", buatWaktuIso("2026-01-01T01:02:00.000Z"));
  assert.equal(v2.proposal.status, "QUALIFIED");
  assert.equal(v2.baruQualified, true);
});

test("finalisasiTuduhan benar -> CLEARED/SOLVED", () => {
  let sesi = sesiDasar();
  sesi = ajukanTuduhan(sesi, "user-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-1", buatWaktuIso("2026-01-01T01:01:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-2", buatWaktuIso("2026-01-01T01:02:00.000Z")).sesi;

  const hasil = finalisasiTuduhan(sesi, goldenCaseBible, buatWaktuIso("2026-01-01T01:03:00.000Z"));
  assert.equal(hasil.tuduhanAkhir.correctCulprit, true);
  assert.equal(hasil.sesi.status, StatusSesi.CLEARED);
  assert.equal(hasil.sesi.outcome, HasilSesi.SOLVED);
});

test("finalisasiTuduhan salah -> CLEARED/FAILED", () => {
  let sesi = sesiDasar();
  sesi = ajukanTuduhan(sesi, "user-1", "S99_WRONG", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-1", buatWaktuIso("2026-01-01T01:01:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-2", buatWaktuIso("2026-01-01T01:02:00.000Z")).sesi;

  const hasil = finalisasiTuduhan(sesi, goldenCaseBible, buatWaktuIso("2026-01-01T01:03:00.000Z"));
  assert.equal(hasil.tuduhanAkhir.correctCulprit, false);
  assert.equal(hasil.sesi.outcome, HasilSesi.FAILED);
});

test("finalisasi duplicate tidak membuat instance kedua / tidak retry", () => {
  let sesi = sesiDasar();
  sesi = ajukanTuduhan(sesi, "user-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-1", buatWaktuIso("2026-01-01T01:01:00.000Z")).sesi;
  sesi = berikanSuaraTuduhan(sesi, "user-2", buatWaktuIso("2026-01-01T01:02:00.000Z")).sesi;

  const h1 = finalisasiTuduhan(sesi, goldenCaseBible, buatWaktuIso("2026-01-01T01:03:00.000Z"));
  const h2 = finalisasiTuduhan(h1.sesi, goldenCaseBible, buatWaktuIso("2026-01-01T01:04:00.000Z"));

  assert.equal(h2.sudahFinalSebelumnya, true);
  assert.equal(h2.sesi, h1.sesi, "sesi tidak berubah pada duplicate finalize");
});

test("finalisasi menolak jika proposal belum qualified", () => {
  let sesi = sesiDasar();
  sesi = ajukanTuduhan(sesi, "user-1", "S01", buatWaktuIso("2026-01-01T01:00:00.000Z")).sesi;
  assert.throws(() => finalisasiTuduhan(sesi, goldenCaseBible, buatWaktuIso("2026-01-01T01:01:00.000Z")), KesalahanValidasi);
});