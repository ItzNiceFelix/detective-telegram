import test from "node:test";
import assert from "node:assert/strict";

import { KesalahanAutorisasi } from "../../src/fondasi/eror.js";
import {
  beriSesiE2E,
  ambilSesi,
  selidiki,
  periksa,
  interogasi,
  konfrontasi,
  perbaruiTeori,
  DETEKTIF_1,
  DETEKTIF_2,
  SPECTATOR,
} from "./golden-case-helper.js";

/**
 * SHARED STATE — 2 detective + 1 spectator.
 * Evidence, hasil interogasi, timeline, theory bersifat shared.
 * Spectator read-only: semua mutasi ditolak.
 */
test("SHARED STATE: evidence/interrogation/timeline/theory dibagikan; spectator ditolak mutasi", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);

  // D1 menyelidiki & menemukan E01 (shared).
  const inv = await selidiki(konteks, "ROOM_407");
  assert.equal(inv.status, "berhasil");
  const d1Periksa = await periksa(konteks, "OBJ_WATCH", DETEKTIF_1);
  assert.equal(d1Periksa.status, "berhasil");
  if (d1Periksa.status === "berhasil") assert.equal(d1Periksa.data.evidenceId, "E01");

  // D2 melihat evidence yang ditemukan D1 (shared discovery, bukan personal).
  let sesi = await ambilSesi(konteks);
  assert.ok(sesi.discoveredEvidenceIds.includes("E01"), "evidence discovery shared");

  // D1 menemukan E04 untuk konfrontasi.
  await periksa(konteks, "OBJ_CCTV", DETEKTIF_1);

  // D2 menginterogasi Marcus → ST01; statement shared ke D1.
  const d2Interogasi = await interogasi(konteks, "ASK_ALIBI", DETEKTIF_2);
  assert.equal(d2Interogasi.status, "berhasil");
  sesi = await ambilSesi(konteks);
  assert.ok(sesi.unlockedStatementIds.includes("ST01"), "statement unlock shared");
  assert.ok(sesi.unlockedDialogueIds.includes("NODE_ALIBI_01"), "dialogue node shared");

  // D1 mengonfrontasi dengan E04 → kontradiksi & timeline shared.
  const d1Konfrontasi = await konfrontasi(konteks, "E04", DETEKTIF_1);
  assert.equal(d1Konfrontasi.status, "berhasil");
  sesi = await ambilSesi(konteks);
  assert.ok(sesi.discoveredContradictionIds.includes("CONTRA_01"), "contradiction shared");
  assert.ok(sesi.knownTimelineEventIds.includes("T02"), "timeline knowledge shared");

  // D2 memperbarui teori → currentTheory shared (satu objek di sesi).
  const d2Teori = await perbaruiTeori(
    konteks,
    { culpritSuspectId: "S01", evidenceRefs: ["E04"], timelineHypothesisEventIds: ["T02"] },
    DETEKTIF_2,
  );
  assert.equal(d2Teori.status, "berhasil");
  sesi = await ambilSesi(konteks);
  assert.equal(sesi.currentTheory?.culpritSuspectId, "S01", "theory shared");
  assert.equal(sesi.currentTheory?.updatedBy, DETEKTIF_2);

  // SPECTATOR: semua mutasi ditolak (fail-closed di application service).
  const p = await periksa(konteks, "OBJ_FOOTPRINTS", SPECTATOR);
  assert.equal(p.status, "gagal");
  assert.ok(p.status === "gagal" && p.error instanceof KesalahanAutorisasi);

  const i = await interogasi(konteks, "ASK_MOTIVE", SPECTATOR);
  assert.equal(i.status, "gagal");
  assert.ok(i.status === "gagal" && i.error instanceof KesalahanAutorisasi);

  const k = await konfrontasi(konteks, "E04", SPECTATOR);
  assert.equal(k.status, "gagal");
  assert.ok(k.status === "gagal" && k.error instanceof KesalahanAutorisasi);

  const t = await perbaruiTeori(konteks, { culpritSuspectId: "S01" }, SPECTATOR);
  assert.equal(t.status, "gagal");
  assert.ok(t.status === "gagal" && t.error instanceof KesalahanAutorisasi);

  // State tidak berubah akibat percobaan spectator.
  sesi = await ambilSesi(konteks);
  assert.ok(!sesi.examinedObjectIds.includes("OBJ_FOOTPRINTS"), "spectator tidak mengubah state");
  assert.equal(sesi.currentTheory?.updatedBy, DETEKTIF_2);
});