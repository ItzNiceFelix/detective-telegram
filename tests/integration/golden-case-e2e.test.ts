import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi, HasilSesi, JenisKejadianDomain } from "../../src/domain/enums.js";
import { evaluasiGrafPembuktian } from "../../src/domain/services/graf-pembuktian.js";
import { ambilPeristiwaLinimasa } from "../../src/domain/services/linimasa.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import {
  beriSesiE2E,
  selidiki,
  periksa,
  interogasi,
  konfrontasi,
  perbaruiTeori,
  ajukanTuduhan,
  voteTuduhan,
  finalisasiTuduhan,
  resolusiSnapshot,
  ambilSesi,
  eventAksi,
  DETEKTIF_1,
  DETEKTIF_2,
  CHAT_E2E,
} from "./golden-case-helper.js";

/**
 * GOLDEN CASE E2E — SOLVED PATH (2 detective + spectator context; spectator tidak ikut playerIds).
 * Alur: /newcase → LOBBY → /startcase → OPEN → investigate → inspect → interrogate →
 * confront → contradiction/timeline/proof → theory → propose Marcus → votes → final accusation → CLEARED+SOLVED.
 */
test("SOLVED PATH: Golden Case complete clearance menghasilkan CLEARED+SOLVED + snapshot", async () => {
  const konteks = await beriSesiE2E([DETEKTIF_2 as never]);

  // (1) /newcase → LOBBY, (3) /startcase → OPEN — sudah dijamin helper.
  const sesiAwal = await ambilSesi(konteks);
  assert.equal(sesiAwal.status, StatusSesi.OPEN);
  assert.deepEqual([...sesiAwal.playerIds].sort(), ["42", "43"]);

  // (5) /investigate ROOM_407.
  const investigasi = await selidiki(konteks, "ROOM_407");
  assert.equal(investigasi.status, "berhasil");
  if (investigasi.status === "berhasil") {
    const ids = investigasi.data.objekTampak.map((o) => o.objectId);
    assert.ok(ids.includes("OBJ_WATCH"));
    assert.ok(ids.includes("OBJ_FOOTPRINTS"));
    assert.ok(ids.includes("OBJ_WINDOW"));
    assert.ok(ids.includes("OBJ_CCTV"));
  }

  // (6-7) inspect relevant objects → discover E01..E04.
  for (const [objek, evidens] of [
    ["OBJ_WATCH", "E01"],
    ["OBJ_FOOTPRINTS", "E02"],
    ["OBJ_WINDOW", "E03"],
    ["OBJ_CCTV", "E04"],
  ] as const) {
    const hasil = await periksa(konteks, objek);
    assert.equal(hasil.status, "berhasil");
    if (hasil.status === "berhasil") {
      assert.equal(hasil.data.evidenceId, evidens);
      assert.equal(hasil.data.evidenceBaruDitemukan, true);
    }
  }

  let sesi = await ambilSesi(konteks);
  assert.deepEqual([...sesi.discoveredEvidenceIds].sort(), ["E01", "E02", "E03", "E04"]);

  // (8) /interrogate Marcus (ASK_ALIBI) → statement kanonik ST01.
  const hasilInterogasi = await interogasi(konteks, "ASK_ALIBI");
  assert.equal(hasilInterogasi.status, "berhasil");
  if (hasilInterogasi.status === "berhasil") {
    assert.match(hasilInterogasi.data.responseText, /I left at 22:30/);
  }
  sesi = await ambilSesi(konteks);
  assert.ok(sesi.unlockedStatementIds.includes("ST01"));

  // (10) confront Marcus with E04 → (11) contradiction CONTRA_01 + (12) timeline T02.
  const hasilKonfrontasi = await konfrontasi(konteks, "E04");
  assert.equal(hasilKonfrontasi.status, "berhasil");
  if (hasilKonfrontasi.status === "berhasil") {
    assert.equal(hasilKonfrontasi.data.kontradiksiBaruDitemukan, true);
    assert.equal(hasilKonfrontasi.data.contradictionId, "CONTRA_01");
    assert.equal(hasilKonfrontasi.data.timelineBaruDiketahui, true);
  }

  sesi = await ambilSesi(konteks);
  assert.ok(sesi.discoveredContradictionIds.includes("CONTRA_01"));
  assert.ok(sesi.knownTimelineEventIds.includes("T02"), "(12) timeline knowledge updated");
  assert.ok(sesi.unlockedDialogueIds.includes("NODE_CONFRONT_E04"));

  // (13) proof support updated → PROVEN (E04+T02 wajib terpenuhi).
  const statusBukti = evaluasiGrafPembuktian(sesi, goldenCaseBible, "PROOF_MARCUS_PRESENT");
  assert.equal(statusBukti, "PROVEN");

  // Timeline view hanya menampilkan event yang sudah diketahui.
  const linimasa = ambilPeristiwaLinimasa(sesi, goldenCaseBible);
  assert.deepEqual(linimasa.map((p) => p.eventId), ["T02"]);
  assert.deepEqual(linimasa[0]?.relatedStatementIds, ["ST02"]);

  // (14-15) shared theory → support deterministik PROVEN.
  const hasilTeori = await perbaruiTeori(konteks, {
    culpritSuspectId: "S01",
    motiveId: goldenCaseBible.motiveId,
    methodId: goldenCaseBible.methodId,
    timelineHypothesisEventIds: ["T02"],
    evidenceRefs: ["E04"],
  });
  assert.equal(hasilTeori.status, "berhasil");
  if (hasilTeori.status === "berhasil") {
    assert.ok(["STRONG", "PROVEN"].includes(hasilTeori.data.support), `support=${hasilTeori.data.support}`);
  }

  // (16) propose Marcus.
  const hasilProposal = await ajukanTuduhan(konteks, "S01");
  assert.equal(hasilProposal.status, "berhasil");
  if (hasilProposal.status === "berhasil") {
    assert.equal(hasilProposal.data.suspectId, "S01");
    assert.equal(hasilProposal.data.status, "OPEN");
  }

  // (17-18) detective voting: strict majority (2 aktif → kuorum 2).
  const v1 = await voteTuduhan(konteks, DETEKTIF_1);
  assert.equal(v1.status, "berhasil");
  if (v1.status === "berhasil") assert.equal(v1.data.status, "OPEN");
  const v2 = await voteTuduhan(konteks, DETEKTIF_2);
  assert.equal(v2.status, "berhasil");
  if (v2.status === "berhasil") {
    assert.equal(v2.data.status, "QUALIFIED");
    assert.equal(v2.data.votes.length, 2);
  }

  // (19-21) final accusation → CLEARED + SOLVED.
  const hasilFinal = await finalisasiTuduhan(konteks);
  assert.equal(hasilFinal.status, "berhasil");
  if (hasilFinal.status === "berhasil") {
    assert.equal(hasilFinal.data.correctCulprit, true);
    assert.equal(hasilFinal.data.suspectId, "S01");
  }

  sesi = await ambilSesi(konteks);
  assert.equal(sesi.status, StatusSesi.CLEARED);
  assert.equal(sesi.outcome, HasilSesi.SOLVED);
  assert.equal(sesi.finalAccusation?.correctCulprit, true);
  assert.ok(sesi.solvedAt);

  // (22) resolution snapshot tersimpan.
  const snapshot = resolusiSnapshot(konteks);
  assert.ok(snapshot, "resolution snapshot tersimpan");
  assert.equal(snapshot?.outcome, "SOLVED");
  assert.equal(snapshot?.canonicalCulpritSuspectId, "S01");
  assert.equal(snapshot?.finalAccusation?.correctCulprit, true);
  assert.ok(snapshot?.groupScore >= 500, `groupScore=${String(snapshot?.groupScore)}`);

  // Event log: tidak ada event dup; semua event inti ada.
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.FINAL_ACCUSATION)).length, 1);
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CASE_CLEARED)).length, 1);
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.CONTRADICTION_FOUND)).length, 1);
  assert.equal((await eventAksi(konteks, JenisKejadianDomain.TIMELINE_KNOWLEDGE_GAINED)).length, 1);

  // Reward tidak duplikat: kontribusi final tunggal.
  const kontribusi = konteks.firestore.semuaDokumen(`case_sessions/${String(konteks.sessionId)}/contributions`);
  const rewardFinal = kontribusi.filter((k) => k.type === "CORRECT_FINAL_RESOLUTION");
  assert.equal(rewardFinal.length, 1, "reward final hanya sekali");

  // Group active session pointer masih menunjuk sesi ini (tidak berubah).
  const grup = konteks.firestore.ambilDokumen("groups", CHAT_E2E);
  assert.equal(grup?.activeCaseSessionId, String(konteks.sessionId));
});