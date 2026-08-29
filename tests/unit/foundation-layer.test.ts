import test from "node:test";
import assert from "node:assert/strict";

import { berhasil, gagal, apakahBerhasil } from "../../src/fondasi/hasil.js";
import { KesalahanValidasi, KesalahanAutorisasi } from "../../src/fondasi/eror.js";
import { buatIdPemain, buatIdSesiKasus } from "../../src/fondasi/primitif.js";
import { SistemWaktu } from "../../src/fondasi/waktu.js";
import { validasiKonfigurasiAplikasi } from "../../src/konfigurasi/aplikasi.js";
import { validasiAtauTolak, ValidatorAutorisasi } from "../../src/aplikasi/otorisasi.js";

test("hasil operasi mengevaluasi state berhasil dengan benar", () => {
  const hasil = berhasil({ ok: true });

  assert.equal(hasil.status, "berhasil");
  assert.equal(apakahBerhasil(hasil), true);
  assert.deepEqual(hasil.data, { ok: true });
});

test("hasil operasi mengevaluasi state gagal dengan benar", () => {
  const error = new KesalahanValidasi("validasi gagal");
  const hasil = gagal(error);

  assert.equal(hasil.status, "gagal");
  assert.equal(apakahBerhasil(hasil), false);
  assert.equal(hasil.error.message, "validasi gagal");
});

test("waktu menyediakan timestamp ISO yang valid", () => {
  const waktu = new SistemWaktu();
  const value = waktu.sekarangIso();

  assert.match(value, /^\d{4}-\d{2}-\d{2}T/);
});

test("konfigurasi aplikasi menolak budget yang lebih kecil dari target", () => {
  assert.throws(
    () => validasiKonfigurasiAplikasi({ vercelFunctionBudget: 3, targetFunctionCount: 4 }),
    /Budget Vercel function/
  );
});

test("validator otorisasi menolak akses yang tidak valid", async () => {
  const validator = new ValidatorAutorisasi();

  await assert.rejects(
    () => validasiAtauTolak(validator, buatIdPemain("user-1"), buatIdSesiKasus("")),
    KesalahanAutorisasi
  );
});
