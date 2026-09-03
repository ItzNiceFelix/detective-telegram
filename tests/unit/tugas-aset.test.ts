import test from "node:test";
import assert from "node:assert/strict";

import {
  buatTugasAset,
  dapatTerimaKiriman,
  identitasTugasAset,
  transisiTugasAset,
  type TugasAset,
} from "../../src/kasus/tugas-aset.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";

function seed(over?: Partial<Parameters<typeof buatTugasAset>[0]>) {
  return buatTugasAset({
    taskId: "task-1",
    caseId: "CASE-1",
    caseVersionId: "V1",
    sceneId: "S1",
    planId: "P1",
    assetType: "CRIME_SCENE",
    prompt: "Generate a scene illustration.",
    requiredClues: ["CLUE-01"],
    ...over,
  });
}

test("buatTugasAset → status DRAFT dengan field minimal", () => {
  const t = seed();
  assert.equal(t.status, "DRAFT");
  assert.equal(t.taskId, "task-1");
  assert.equal(identitasTugasAset(t.caseId, t.sceneId, t.planId), "CASE-1:S1:P1");
  assert.deepEqual(t.requiredClues, ["CLUE-01"]);
  assert.ok(t.createdAt.length > 0);
});

test("buatTugasAset → gagal bila prompt kosong", () => {
  assert.throws(() => seed({ prompt: "  " }), KesalahanValidasi);
});

test("buatTugasAset → gagal bila tanpa required clue", () => {
  assert.throws(() => seed({ requiredClues: [] }), KesalahanValidasi);
});

test("transisi: DRAFT → WAITING_FOR_ADMIN → SUBMITTED → VERIFYING → VERIFIED", () => {
  let t = seed();
  t = transisiTugasAset(t, "WAITING_FOR_ADMIN");
  assert.equal(t.status, "WAITING_FOR_ADMIN");
  t = transisiTugasAset(t, "SUBMITTED");
  assert.equal(t.status, "SUBMITTED");
  t = transisiTugasAset(t, "VERIFYING");
  assert.equal(t.status, "VERIFYING");
  t = transisiTugasAset(t, "VERIFIED");
  assert.equal(t.status, "VERIFIED");
});

test("transisi invalid: DRAFT → VERIFIED tidak legal", () => {
  const t = seed();
  assert.throws(() => transisiTugasAset(t, "VERIFIED"), KesalahanValidasi);
});

test("transisi invalid: VERIFIED immutable (tidak ada transisi keluar)", () => {
  let t = seed();
  t = transisiTugasAset(t, "WAITING_FOR_ADMIN");
  t = transisiTugasAset(t, "SUBMITTED");
  t = transisiTugasAset(t, "VERIFIED");
  assert.throws(() => transisiTugasAset(t, "WAITING_FOR_ADMIN"), KesalahanValidasi);
});

test("transisi status sama (non-SUBMITTED) ditolak", () => {
  const t = seed();
  assert.throws(() => transisiTugasAset(t, "DRAFT"), KesalahanValidasi);
  const w = transisiTugasAset(t, "WAITING_FOR_ADMIN");
  assert.throws(() => transisiTugasAset(w, "WAITING_FOR_ADMIN"), KesalahanValidasi);
});

test("transisi reject → REJECTED → WAITING_FOR_ADMIN", () => {
  let t = seed();
  t = transisiTugasAset(t, "WAITING_FOR_ADMIN");
  t = transisiTugasAset(t, "SUBMITTED");
  const rej = transisiTugasAset(t, "REJECTED");
  assert.equal(rej.status, "REJECTED");
  const aktif = transisiTugasAset(rej, "WAITING_FOR_ADMIN");
  assert.equal(aktif.status, "WAITING_FOR_ADMIN");
});

test("expiry: DRAFT → EXPIRED; EXPIRED immutable", () => {
  let t = seed();
  t = transisiTugasAset(t, "EXPIRED");
  assert.equal(t.status, "EXPIRED");
  assert.throws(() => transisiTugasAset(t, "WAITING_FOR_ADMIN"), KesalahanValidasi);
});

test("dapatTerimaKiriman: hanya WAITING_FOR_ADMIN/REJECTED/SUBMITTED", () => {
  assert.ok(dapatTerimaKiriman("WAITING_FOR_ADMIN"));
  assert.ok(dapatTerimaKiriman("REJECTED"));
  assert.ok(dapatTerimaKiriman("SUBMITTED"));
  assert.equal(dapatTerimaKiriman("VERIFIED"), false);
  assert.equal(dapatTerimaKiriman("VERIFYING"), false);
  assert.equal(dapatTerimaKiriman("DRAFT"), false);
  assert.equal(dapatTerimaKiriman("EXPIRED"), false);
});

test("immutability: transisi mengembalikan objek baru tanpa memutasi asal", () => {
  const t = seed();
  const t2 = transisiTugasAset(t, "WAITING_FOR_ADMIN");
  assert.equal(t.status, "DRAFT");
  assert.equal(t2.status, "WAITING_FOR_ADMIN");
  assert.notEqual(t, t2);
});