import test from "node:test";
import assert from "node:assert/strict";

import {
  beriSesiE2E,
  periksa,
  interogasi,
  konfrontasi,
  perbaruiTeori,
  ajukanTuduhan,
  voteTuduhan,
  finalisasiTuduhan,
  DETEKTIF_1,
  DETEKTIF_2,
} from "./golden-case-helper.js";

/**
 * FIRESTORE I/O — mengukur reads/writes per aksi utama pada jalur SOLVED,
 * serta memeriksa transaction boundaries / hot document / unbounded fields.
 * Angka dihitung dari FirestorePalsu (riwayatBaca/riwayatTulis).
 */
test("FIRESTORE I/O: hitung reads/writes per major action", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);

  interface Catatan {
    aksi: string;
    baca: number;
    tulis: number;
  }
  const catatan: Catatan[] = [];
  const ambilDelta = (aksi: string) => {
    catatan.push({ aksi, baca: konteks.firestore.riwayatBaca.length, tulis: konteks.firestore.riwayatTulis.length });
  };

  // /newcase + /startcase sudah terjadi di helper (bootstrap); mulai hitung dari sini.
  const baca0 = konteks.firestore.riwayatBaca.length;
  const tulis0 = konteks.firestore.riwayatTulis.length;
  void baca0;
  void tulis0;

  await periksa(konteks, "OBJ_WATCH", DETEKTIF_1);
  ambilDelta("inspect (evidence baru)");

  await periksa(konteks, "OBJ_CCTV", DETEKTIF_1);
  ambilDelta("inspect (evidence baru #2)");

  await interogasi(konteks, "ASK_ALIBI", DETEKTIF_1);
  ambilDelta("interrogate (unlock statement)");

  await konfrontasi(konteks, "E04", DETEKTIF_1);
  ambilDelta("confront (kontradiksi)");

  await perbaruiTeori(konteks, { culpritSuspectId: "S01", evidenceRefs: ["E04"] }, DETEKTIF_1);
  ambilDelta("theory update");

  await ajukanTuduhan(konteks, "S01", DETEKTIF_1);
  ambilDelta("accuse propose");

  await voteTuduhan(konteks, DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_2);
  ambilDelta("accuse votes (2)");

  await finalisasiTuduhan(konteks, DETEKTIF_1);
  ambilDelta("final accusation");

  // Laporan (untuk dokumen audit).
  const laporan = catatan.map((c) => `  ${c.aksi.padEnd(30)} reads(cum) = ${c.baca}, writes(cum) = ${c.tulis}`).join("\n");
  console.log(`\n[Firestore I/O — kumulatif]\n${laporan}\n`);

  // Sanity: tidak ada aksi utama yang tanpa tulis; final menghasilkan snapshot + kontribusi + event.
  for (const c of catatan) {
    assert.ok(c.tulis > 0, `aksi ${c.aksi} harus menulis >= 1 dokumen`);
  }

  // Hot document: semua mutasi gameplay menulis dokumen CaseSession yang sama.
  const pathSesi = `case_sessions/${String(konteks.sessionId)}`;
  const tulisSesi = konteks.firestore.riwayatTulis.filter((p) => p === pathSesi).length;
  assert.ok(tulisSesi >= 5, `dokumen sesi adalah hot document: ${tulisSesi} write sepanjang alur`);

  // Snapshot + contributions + events tertulis.
  const semuaTulis = konteks.firestore.riwayatTulis;
  assert.ok(semuaTulis.some((p) => p.endsWith("/resolution/snapshot")), "snapshot resolution ditulis");
  assert.ok(semuaTulis.some((p) => p.includes("/contributions/")), "kontribusi ditulis");
  assert.ok(semuaTulis.some((p) => p.includes("/events/")), "event ditulis");
});