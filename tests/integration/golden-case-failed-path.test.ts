import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi, HasilSesi, JenisKejadianDomain } from "../../src/domain/enums.js";
import { validasiTransisiSesi } from "../../src/domain/services/transisi-sesi.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
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
 * GOLDEN CASE E2E — FAILED PATH (wrong accusation).
 * Jalankan kasus sampai menyerahkan tuduhan salah → CLEARED + FAILED.
 * Tidak boleh: reopen, accusation kedua, retry, duplicate resolution, duplicate score/reward.
 */
test("FAILED PATH: wrong final accusation → CLEARED+FAILED, tidak ada retry/accusation kedua", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);

  // Investigasi cukup untuk melanjutkan ke accusation (semua bukti).
  for (const objek of ["OBJ_WATCH", "OBJ_FOOTPRINTS", "OBJ_WINDOW", "OBJ_CCTV"]) {
    await periksa(konteks, objek);
  }

  // Propose suspect yang SALAH (bukan Marcus/S01).
  const proposal = await ajukanTuduhan(konteks, "S99_WRONG");
  assert.equal(proposal.status, "berhasil");
  if (proposal.status === "berhasil") assert.equal(proposal.data.suspectId, "S99_WRONG");

  // Strict majority 2/2 → qualified.
  await voteTuduhan(konteks, DETEKTIF_1);
  const v2 = await voteTuduhan(konteks, DETEKTIF_2);
  assert.equal(v2.status, "berhasil");
  if (v2.status === "berhasil") assert.equal(v2.data.status, "QUALIFIED");

  // Finalize salah → CLEARED + FAILED.
  const hasilFinal = await finalisasiTuduhan(konteks);
  assert.equal(hasilFinal.status, "berhasil");
  if (hasilFinal.status === "berhasil") {
    assert.equal(hasilFinal.data.correctCulprit, false);
  }

  let sesi = await ambilSesi(konteks);
  assert.equal(sesi.status, StatusSesi.CLEARED);
  assert.equal(sesi.outcome, HasilSesi.FAILED);
  assert.equal(sesi.finalAccusation?.correctCulprit, false);
  assert.equal(sesi.solvedAt, undefined, "tidak boleh ada solvedAt untuk FAILED");

  // Snapshot: outcome FAILED.
  const snapshot = resolusiSnapshot(konteks);
  assert.equal(snapshot?.outcome, "FAILED");

  // Tidak boleh accusation kedua: ajukanTuduhan di sesi CLEARED → ditolak.
  const proposalKedua = await ajukanTuduhan(konteks, "S01");
  assert.equal(proposalKedua.status, "gagal");

  // Tidak boleh retry / duplicate resolution: finalize kedua di sesi CLEARED → ditolak.
  const finalKedua = await finalisasiTuduhan(konteks);
  assert.equal(finalKedua.status, "gagal");

  // Tidak boleh reopen: transisi dari CLEARED ke OPEN/LOBBY illegal menurut state machine.
  assert.throws(() => validasiTransisiSesi(StatusSesi.CLEARED, StatusSesi.OPEN), KesalahanValidasi);
  assert.throws(() => validasiTransisiSesi(StatusSesi.CLEARED, StatusSesi.LOBBY), KesalahanValidasi);

  // Tidak boleh duplicate reward: tidak ada CORRECT_FINAL_RESOLUTION untuk tuduhan salah.
  const kontribusi = konteks.firestore.semuaDokumen(`case_sessions/${String(konteks.sessionId)}/contributions`);
  assert.equal(kontribusi.filter((k) => k.type === "CORRECT_FINAL_RESOLUTION").length, 0, "tidak ada reward benar");

  // Tepat satu FINAL_ACCUSATION dan satu CASE_CLEARED (duplicate tidak menambah).
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.FINAL_ACCUSATION)).length, 1);
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CASE_CLEARED)).length, 1);

  // Snapshot tidak ter-overwrite oleh duplicate (tetap FAILED).
  sesi = await ambilSesi(konteks);
  assert.equal(sesi.status, StatusSesi.CLEARED);
  assert.equal(sesi.outcome, HasilSesi.FAILED);
});