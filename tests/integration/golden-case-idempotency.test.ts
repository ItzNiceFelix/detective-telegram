import test from "node:test";
import assert from "node:assert/strict";

import { JenisKejadianDomain } from "../../src/domain/enums.js";
import {
  beriSesiE2E,
  periksa,
  interogasi,
  konfrontasi,
  ajukanTuduhan,
  voteTuduhan,
  finalisasiTuduhan,
  resolusiSnapshot,
  ambilSesi,
  eventAksi,
  DETEKTIF_1,
  DETEKTIF_2,
} from "./golden-case-helper.js";

/**
 * IDEMPOTENCY — duplicate delivery (retry Telegram update/aksi yang sama)
 * tidak boleh menghasilkan mutasi/reward/event kedua.
 * Catatan: guard idempotency update-level (telegram:update:{id}) hanya dipakai
 * /newcase & /startcase; aksi gameplay memakai action-level idempotency
 * di domain service (dokumentasikan di audit).
 */
test("IDEMPOTENCY: inspect duplikat tidak menambah discovery/event", async () => {
  const konteks = await beriSesiE2E();
  await periksa(konteks, "OBJ_WATCH", DETEKTIF_1);
  const ulang = await periksa(konteks, "OBJ_WATCH", DETEKTIF_1);

  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") {
    assert.equal(ulang.data.evidenceBaruDitemukan, false);
    assert.equal(ulang.data.sudahDiperiksaSebelumnya, true);
  }
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.EVIDENCE_DISCOVERED)).length, 1);
  const sesi = await ambilSesi(konteks);
  assert.equal(sesi.discoveredEvidenceIds.length, 1);
});

test("IDEMPOTENCY: interrogate duplikat tidak menambah unlock/event", async () => {
  const konteks = await beriSesiE2E();
  await interogasi(konteks, "ASK_ALIBI", DETEKTIF_1);
  const ulang = await interogasi(konteks, "ASK_ALIBI", DETEKTIF_1);

  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") {
    assert.equal(ulang.data.nodeBaruDiunlock, false);
    assert.equal(ulang.data.sudahDiunlockSebelumnya, true);
  }
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.STATEMENT_UNLOCKED)).length, 1);
  const sesi = await ambilSesi(konteks);
  assert.deepEqual(sesi.unlockedStatementIds, ["ST01"]);
});

test("IDEMPOTENCY: confront duplikat tidak menambah kontradiksi/event", async () => {
  const konteks = await beriSesiE2E();
  await periksa(konteks, "OBJ_CCTV", DETEKTIF_1);
  await interogasi(konteks, "ASK_ALIBI", DETEKTIF_1);
  await konfrontasi(konteks, "E04", DETEKTIF_1);
  const ulang = await konfrontasi(konteks, "E04", DETEKTIF_1);

  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") {
    assert.equal(ulang.data.kontradiksiBaruDitemukan, false);
    assert.equal(ulang.data.sudahDikonfrontasiSebelumnya, true);
  }
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CONTRADICTION_FOUND)).length, 1);
  const sesi = await ambilSesi(konteks);
  assert.deepEqual(sesi.discoveredContradictionIds, ["CONTRA_01"]);
});

test("IDEMPOTENCY: vote duplikat tidak menambah suara", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await ajukanTuduhan(konteks, "S01", DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_1);
  const ulang = await voteTuduhan(konteks, DETEKTIF_1);

  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") assert.equal(ulang.data.votes.length, 1);
  const sesi = await ambilSesi(konteks);
  assert.equal(sesi.accusationProposal?.votes.length, 1);
});

test("IDEMPOTENCY: final accusation duplikat → safe replay, tanpa mutasi/event/reward kedua", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await ajukanTuduhan(konteks, "S01", DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_2);

  const pertama = await finalisasiTuduhan(konteks, DETEKTIF_1);
  assert.equal(pertama.status, "berhasil");

  // Safe-replay (PERSIST-07 / Requisite Defect #1): duplicate finalize pada sesi CLEARED
  // mengembalikan hasil existing (sudahFinalSebelumnya) tanpa mutasi/event/reward kedua.
  const ulang = await finalisasiTuduhan(konteks, DETEKTIF_1);
  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") {
    assert.equal(ulang.data.suspectId, "S01");
    assert.equal(ulang.data.correctCulprit, true);
  }

  // Yang penting: tidak ada mutasi/reward/event kedua.
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.FINAL_ACCUSATION)).length, 1);
  const snapshot = resolusiSnapshot(konteks);
  assert.equal(snapshot?.outcome, "SOLVED");
  const kontribusi = konteks.firestore.semuaDokumen(`case_sessions/${String(konteks.sessionId)}/contributions`);
  assert.equal(kontribusi.filter((k) => k.type === "CORRECT_FINAL_RESOLUTION").length, 1);
});