import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { selidikiAdegan, ambilObjekYangDapatDiperiksa, periksaObjek } from "../../src/domain/services/investigasi.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

function sesiTerbuka(overrides: Partial<SesiKasus> = {}): SesiKasus {
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
    ...overrides,
  };
}

test("selidikiAdegan menolak jika sesi tidak OPEN", () => {
  const sesi = sesiTerbuka({ status: StatusSesi.LOBBY });
  assert.throws(() => selidikiAdegan(sesi, goldenCaseBible, "ROOM_407"), KesalahanValidasi);
});

test("selidikiAdegan menolak scene yang tidak ditemukan", () => {
  const sesi = sesiTerbuka();
  assert.throws(() => selidikiAdegan(sesi, goldenCaseBible, "SCENE_TIDAK_ADA"), KesalahanValidasi);
});

test("selidikiAdegan mengembalikan 4 objek AUTO tanpa evidence E03 discovered (Wine Glass belum visible)", () => {
  const sesi = sesiTerbuka();
  const hasil = selidikiAdegan(sesi, goldenCaseBible, "ROOM_407");

  const ids = hasil.objekTampak.map((o) => o.objectId);
  assert.ok(ids.includes("OBJ_WATCH"));
  assert.ok(ids.includes("OBJ_FOOTPRINTS"));
  assert.ok(ids.includes("OBJ_WINDOW"));
  assert.ok(ids.includes("OBJ_DESK"));
  assert.ok(!ids.includes("OBJ_WINEGLASS"), "Wine Glass belum visible sebelum E03 discovered");
});

test("ambilObjekYangDapatDiperiksa menampilkan Wine Glass setelah E03 discovered", () => {
  const sesi = sesiTerbuka({ discoveredEvidenceIds: ["E03"] });
  const objek = ambilObjekYangDapatDiperiksa(sesi, goldenCaseBible, "ROOM_407");

  const ids = objek.map((o) => o.objectId);
  assert.ok(ids.includes("OBJ_WINEGLASS"));
});

test("periksaObjek menolak object yang tidak ditemukan", () => {
  const sesi = sesiTerbuka();
  assert.throws(
    () => periksaObjek(sesi, goldenCaseBible, "OBJ_TIDAK_ADA", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z")),
    KesalahanValidasi,
  );
});

test("periksaObjek menolak Wine Glass sebelum prasyarat terpenuhi", () => {
  const sesi = sesiTerbuka();
  assert.throws(
    () => periksaObjek(sesi, goldenCaseBible, "OBJ_WINEGLASS", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z")),
    KesalahanValidasi,
  );
});

test("periksaObjek menghasilkan observation dan evidence discovery untuk Broken Watch", () => {
  const sesi = sesiTerbuka();
  const waktu = buatWaktuIso("2026-01-01T01:00:00.000Z");

  const hasil = periksaObjek(sesi, goldenCaseBible, "OBJ_WATCH", buatIdPemain("user-1"), waktu);

  assert.equal(hasil.evidenceBaruDitemukan, true);
  assert.equal(hasil.evidenceId, "E01");
  assert.equal(hasil.sudahDiperiksaSebelumnya, false);
  assert.ok(hasil.sesi.examinedObjectIds.includes("OBJ_WATCH"));
  assert.ok(hasil.sesi.discoveredEvidenceIds.includes("E01"));
});

test("periksaObjek pada Desk menghasilkan observation tanpa evidence", () => {
  const sesi = sesiTerbuka();
  const hasil = periksaObjek(sesi, goldenCaseBible, "OBJ_DESK", buatIdPemain("user-1"), buatWaktuIso("2026-01-01T01:00:00.000Z"));

  assert.equal(hasil.evidenceBaruDitemukan, false);
  assert.equal(hasil.evidenceId, undefined);
  assert.ok(hasil.sesi.examinedObjectIds.includes("OBJ_DESK"));
  assert.equal(hasil.sesi.discoveredEvidenceIds.length, 0);
});

test("periksaObjek repeated tidak memberi reward tambahan (no-op)", () => {
  const waktu1 = buatWaktuIso("2026-01-01T01:00:00.000Z");
  const sesiSetelahPertama = periksaObjek(sesiTerbuka(), goldenCaseBible, "OBJ_WATCH", buatIdPemain("user-1"), waktu1).sesi;

  const waktu2 = buatWaktuIso("2026-01-01T02:00:00.000Z");
  const hasilKedua = periksaObjek(sesiSetelahPertama, goldenCaseBible, "OBJ_WATCH", buatIdPemain("user-2"), waktu2);

  assert.equal(hasilKedua.sudahDiperiksaSebelumnya, true);
  assert.equal(hasilKedua.evidenceBaruDitemukan, false);
  assert.equal(hasilKedua.sesi, sesiSetelahPertama, "sesi harus tidak berubah (referensi sama) pada no-op");
});