import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { hitungStatusEfektif } from "../../src/domain/value-objects/jarakStatus.js";

test("status efektif memelihara PAUSED tanpa mengubah derived status", () => {
  const hasil = hitungStatusEfektif(StatusSesi.PAUSED, "2026-08-29T00:00:00.000Z");

  assert.equal(hasil.effectiveStatus, "PAUSED");
  assert.equal(hasil.statusPersisted, StatusSesi.PAUSED);
});

test("status efektif default aktif jika timestamp tidak tersedia", () => {
  const hasil = hitungStatusEfektif(StatusSesi.OPEN);

  assert.equal(hasil.effectiveStatus, "ACTIVE");
});
