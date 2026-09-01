import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import {
  validasiTransisiSesi,
  mulaiSesi,
  jedaSesi,
  lanjutkanSesi,
  arsipkanSesi,
  tambahDetektifKeSesi,
  BATAS_DETEKTIF_AKTIF,
} from "../../src/domain/services/transisi-sesi.js";
import type { SesiKasus } from "../../src/domain/entities.js";

function sesiDasar(status: StatusSesi): SesiKasus {
  return {
    sessionId: "session-1" as any,
    caseId: "case-1" as any,
    caseVersionId: "v-1" as any,
    groupId: "group-1" as any,
    status,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
  };
}

test("validasiTransisiSesi menerima transisi legal LOBBY -> OPEN", () => {
  assert.doesNotThrow(() => validasiTransisiSesi(StatusSesi.LOBBY, StatusSesi.OPEN));
});

test("validasiTransisiSesi menolak transisi ilegal OPEN -> LOBBY", () => {
  assert.throws(() => validasiTransisiSesi(StatusSesi.OPEN, StatusSesi.LOBBY), KesalahanValidasi);
});

test("validasiTransisiSesi menolak transisi dari ARCHIVED (terminal)", () => {
  assert.throws(() => validasiTransisiSesi(StatusSesi.ARCHIVED, StatusSesi.OPEN), KesalahanValidasi);
});

test("validasiTransisiSesi menolak CLEARED -> OPEN (tidak boleh reopen)", () => {
  assert.throws(() => validasiTransisiSesi(StatusSesi.CLEARED, StatusSesi.OPEN), KesalahanValidasi);
});

test("validasiTransisiSesi mengizinkan CLEARED -> ARCHIVED", () => {
  assert.doesNotThrow(() => validasiTransisiSesi(StatusSesi.CLEARED, StatusSesi.ARCHIVED));
});

test("mulaiSesi mengubah LOBBY menjadi OPEN dan mengisi startedAt/lastActivityAt", () => {
  const sesi = sesiDasar(StatusSesi.LOBBY);
  const waktu = buatWaktuIso("2026-01-02T00:00:00.000Z");

  const hasil = mulaiSesi(sesi, waktu);

  assert.equal(hasil.status, StatusSesi.OPEN);
  assert.equal(hasil.startedAt, waktu);
  assert.equal(hasil.lastActivityAt, waktu);
  assert.notEqual(hasil, sesi, "harus mengembalikan objek baru, bukan memutasi input");
});

test("mulaiSesi menolak jika sesi bukan LOBBY", () => {
  const sesi = sesiDasar(StatusSesi.OPEN);
  assert.throws(() => mulaiSesi(sesi, buatWaktuIso("2026-01-02T00:00:00.000Z")), KesalahanValidasi);
});

test("jedaSesi mengubah OPEN menjadi PAUSED", () => {
  const sesi = sesiDasar(StatusSesi.OPEN);
  const hasil = jedaSesi(sesi, buatWaktuIso("2026-01-02T00:00:00.000Z"));

  assert.equal(hasil.status, StatusSesi.PAUSED);
});

test("lanjutkanSesi mengubah PAUSED menjadi OPEN dan refresh lastActivityAt", () => {
  const sesi = sesiDasar(StatusSesi.PAUSED);
  const waktu = buatWaktuIso("2026-01-03T00:00:00.000Z");

  const hasil = lanjutkanSesi(sesi, waktu);

  assert.equal(hasil.status, StatusSesi.OPEN);
  assert.equal(hasil.lastActivityAt, waktu);
});

test("arsipkanSesi dapat mengarsipkan dari LOBBY, PAUSED, dan CLEARED", () => {
  for (const status of [StatusSesi.LOBBY, StatusSesi.PAUSED, StatusSesi.CLEARED]) {
    const hasil = arsipkanSesi(sesiDasar(status), buatWaktuIso("2026-01-04T00:00:00.000Z"));
    assert.equal(hasil.status, StatusSesi.ARCHIVED);
  }
});

test("arsipkanSesi menolak dari OPEN", () => {
  assert.throws(() => arsipkanSesi(sesiDasar(StatusSesi.OPEN), buatWaktuIso("2026-01-04T00:00:00.000Z")), KesalahanValidasi);
});

test("tambahDetektifKeSesi menambahkan player baru", () => {
  const sesi = sesiDasar(StatusSesi.LOBBY);
  const hasil = tambahDetektifKeSesi(sesi, buatIdPemain("user-2"), buatWaktuIso("2026-01-02T00:00:00.000Z"));

  assert.equal(hasil.playerIds.length, 2);
  assert.ok(hasil.playerIds.includes(buatIdPemain("user-2")));
});

test("tambahDetektifKeSesi idempotent untuk player yang sudah terdaftar", () => {
  const sesi = sesiDasar(StatusSesi.LOBBY);
  const hasil = tambahDetektifKeSesi(sesi, buatIdPemain("user-1"), buatWaktuIso("2026-01-02T00:00:00.000Z"));

  assert.equal(hasil.playerIds.length, 1);
  assert.equal(hasil, sesi);
});

test("tambahDetektifKeSesi menolak melebihi batas maksimum detective aktif", () => {
  const sesi: SesiKasus = {
    ...sesiDasar(StatusSesi.LOBBY),
    playerIds: Array.from({ length: BATAS_DETEKTIF_AKTIF }, (_, i) => buatIdPemain(`user-${i}`)),
  };

  assert.throws(
    () => tambahDetektifKeSesi(sesi, buatIdPemain("user-overflow"), buatWaktuIso("2026-01-02T00:00:00.000Z")),
    KesalahanValidasi,
  );
});