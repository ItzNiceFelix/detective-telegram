import test from "node:test";
import assert from "node:assert/strict";

import { JenisKejadianDomain } from "../../src/domain/enums.js";
import {
  beriSesiE2E,
  ambilSesi,
  periksa,
  interogasi,
  konfrontasi,
  perbaruiTeori,
  ajukanTuduhan,
  voteTuduhan,
  finalisasiTuduhan,
  resolusiSnapshot,
  eventAksi,
  DETEKTIF_1,
  DETEKTIF_2,
} from "./golden-case-helper.js";

/**
 * CONCURRENCY — menjalankan mutasi simultan terhadap sesi yang sama.
 * FirestorePalsu meniru serialisasi/retry transaction Firestore.
 */
test("CONCURRENCY: evidence discovery simultan tidak duplikat", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);

  // (a) object yang SAMA diperiksa dua detective bersamaan → 1 discovery.
  const [a1, a2] = await Promise.all([
    periksa(konteks, "OBJ_WATCH", DETEKTIF_1),
    periksa(konteks, "OBJ_WATCH", DETEKTIF_2),
  ]);
  assert.equal(a1.status, "berhasil");
  assert.equal(a2.status, "berhasil");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.EVIDENCE_DISCOVERED)).length, 1);

  // (b) object BERBEDA bersamaan → kedua evidence tetap ada (no lost update).
  const [b1, b2] = await Promise.all([
    periksa(konteks, "OBJ_CCTV", DETEKTIF_1),
    periksa(konteks, "OBJ_FOOTPRINTS", DETEKTIF_2),
  ]);
  assert.equal(b1.status, "berhasil");
  assert.equal(b2.status, "berhasil");
  const sesi = await ambilSesi(konteks);
  assert.ok(sesi.discoveredEvidenceIds.includes("E04"));
  assert.ok(sesi.discoveredEvidenceIds.includes("E02"));
  assert.equal(sesi.examinedObjectIds.length, 3, "tidak ada object duplikat di examinedObjectIds");
});

test("CONCURRENCY: interogasi & konfrontasi simultan tidak duplikat", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await periksa(konteks, "OBJ_CCTV", DETEKTIF_1); // E04 untuk konfrontasi

  const [i1, i2] = await Promise.all([
    interogasi(konteks, "ASK_ALIBI", DETEKTIF_1),
    interogasi(konteks, "ASK_ALIBI", DETEKTIF_2),
  ]);
  assert.equal(i1.status, "berhasil");
  assert.equal(i2.status, "berhasil");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.STATEMENT_UNLOCKED)).length, 1, "satu unlock statement");

  const [k1, k2] = await Promise.all([
    konfrontasi(konteks, "E04", DETEKTIF_1),
    konfrontasi(konteks, "E04", DETEKTIF_2),
  ]);
  assert.equal(k1.status, "berhasil");
  assert.equal(k2.status, "berhasil");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CONTRADICTION_FOUND)).length, 1, "satu kontradiksi");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.TIMELINE_KNOWLEDGE_GAINED)).length, 1, "satu timeline gain");

  const sesi = await ambilSesi(konteks);
  assert.deepEqual(sesi.discoveredContradictionIds, ["CONTRA_01"]);
  assert.deepEqual(sesi.knownTimelineEventIds, ["T02"]);
});

test("CONCURRENCY: theory update simultan → satu currentTheory konsisten", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await periksa(konteks, "OBJ_CCTV", DETEKTIF_1);
  await periksa(konteks, "OBJ_WINDOW", DETEKTIF_2);
  await konfrontasi(konteks, "E04", DETEKTIF_1);

  const [t1, t2] = await Promise.all([
    perbaruiTeori(konteks, { culpritSuspectId: "S01", evidenceRefs: ["E04"] }, DETEKTIF_1),
    perbaruiTeori(konteks, { culpritSuspectId: "S01", evidenceRefs: ["E03"] }, DETEKTIF_2),
  ]);
  assert.ok(t1.status === "berhasil" || t2.status === "berhasil");

  const sesi = await ambilSesi(konteks);
  assert.ok(sesi.currentTheory, "currentTheory tunggal");
  assert.equal(sesi.currentTheory?.culpritSuspectId, "S01");
});

test("CONCURRENCY: votes simultan tidak duplikat; qualified tepat sekali", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await ajukanTuduhan(konteks, "S01", DETEKTIF_1);

  const [v1, v2] = await Promise.all([
    voteTuduhan(konteks, DETEKTIF_1),
    voteTuduhan(konteks, DETEKTIF_2),
  ]);
  assert.equal(v1.status, "berhasil");
  assert.equal(v2.status, "berhasil");

  const sesi = await ambilSesi(konteks);
  const proposal = sesi.accusationProposal!;
  assert.equal(proposal.votes.length, 2, "dua suara unik");
  assert.equal(new Set(proposal.votes).size, 2, "tidak ada suara duplikat");
  assert.equal(proposal.status, "QUALIFIED");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.ACCUSATION_QUALIFIED)).length, 1, "qualified sekali");
});

test("CONCURRENCY: final accusation simultan → tepat satu resolution", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);
  await ajukanTuduhan(konteks, "S01", DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_1);
  await voteTuduhan(konteks, DETEKTIF_2);

  const [f1, f2] = await Promise.all([
    finalisasiTuduhan(konteks, DETEKTIF_1),
    finalisasiTuduhan(konteks, DETEKTIF_2),
  ]);

  const sukses = [f1, f2].filter((h) => h.status === "berhasil");
  assert.equal(sukses.length, 1, "hanya satu finalize yang commit");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.FINAL_ACCUSATION)).length, 1, "satu event final");
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CASE_CLEARED)).length, 1);

  const snapshot = resolusiSnapshot(konteks);
  assert.ok(snapshot, "satu snapshot");

  const kontribusi = konteks.firestore.semuaDokumen(`case_sessions/${String(konteks.sessionId)}/contributions`);
  assert.equal(kontribusi.filter((k) => k.type === "CORRECT_FINAL_RESOLUTION").length, 1, "reward tidak duplikat");
});