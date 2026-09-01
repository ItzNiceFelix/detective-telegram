import test from "node:test";
import assert from "node:assert/strict";
import { hitungSkorKasus, hitungKontribusiPemain, BOBOT_SKOR, type KontribusiPemain } from "../../src/domain/services/skor.js";

test("hitungSkorKasus men-dedupe sourceEventId sama", () => {
  const k: KontribusiPemain[] = [
    { playerId: "user-1", type: "EVIDENCE_DISCOVERY", sourceEventId: "E01", points: BOBOT_SKOR.EVIDENCE_DISCOVERY },
    { playerId: "user-1", type: "EVIDENCE_DISCOVERY", sourceEventId: "E01", points: BOBOT_SKOR.EVIDENCE_DISCOVERY }, // duplicate
  ];
  assert.equal(hitungSkorKasus(k, false), 50);
});

test("hitungSkorKasus menambah bonus saat correct resolution", () => {
  const k: KontribusiPemain[] = [
    { playerId: "user-1", type: "EVIDENCE_DISCOVERY", sourceEventId: "E01", points: 50 },
  ];
  assert.equal(hitungSkorKasus(k, true), 50 + 500 + 250);
});

test("hitungKontribusiPemain menjumlah hanya milik player tsb", () => {
  const k: KontribusiPemain[] = [
    { playerId: "user-1", type: "EVIDENCE_DISCOVERY", sourceEventId: "E01", points: 50 },
    { playerId: "user-2", type: "CONTRADICTION_FOUND", sourceEventId: "C01", points: 75 },
  ];
  assert.equal(hitungKontribusiPemain(k, "user-1"), 50);
  assert.equal(hitungKontribusiPemain(k, "user-2"), 75);
});