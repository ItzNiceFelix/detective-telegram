import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { hitungStatusEfektif } from "../../src/domain/value-objects/jarakStatus.js";

const AMBANG = { ambangInaktifJam: 48, ambangDinginJam: 168 };

function jamLalu(jam: number): string {
  return new Date(Date.now() - jam * 60 * 60 * 1000).toISOString();
}

test("sesi OPEN dengan aktivitas baru tetap ACTIVE", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, jamLalu(1), AMBANG);
  assert.equal(hasil.effectiveStatus, "ACTIVE");
});

test("sesi OPEN melewati ambang inaktif menjadi INACTIVE", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, jamLalu(49), AMBANG);
  assert.equal(hasil.effectiveStatus, "INACTIVE");
});

test("sesi OPEN tepat di ambang inaktif (48 jam) sudah INACTIVE", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, jamLalu(48), AMBANG);
  assert.equal(hasil.effectiveStatus, "INACTIVE");
});

test("sesi OPEN melewati ambang dingin menjadi COLD", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, jamLalu(200), AMBANG);
  assert.equal(hasil.effectiveStatus, "COLD");
});

test("sesi OPEN tanpa lastActivityAt default ACTIVE", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, undefined, AMBANG);
  assert.equal(hasil.effectiveStatus, "ACTIVE");
});

test("sesi OPEN dengan timestamp tidak valid default ACTIVE, tidak crash", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, "bukan-tanggal-valid", AMBANG);
  assert.equal(hasil.effectiveStatus, "ACTIVE");
});

test("sesi PAUSED tidak pernah menjadi INACTIVE/COLD walau lastActivityAt lama", () => {
  const hasil = hitungStatusEfektif(StatusSesi.PAUSED, jamLalu(1000), AMBANG);
  assert.equal(hasil.effectiveStatus, "PAUSED");
});

test("sesi menggunakan ambang default ketika parameter ambang tidak diberikan", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN, jamLalu(49));
  assert.equal(hasil.effectiveStatus, "INACTIVE");
});