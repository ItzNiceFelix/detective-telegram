import test from "node:test";
import assert from "node:assert/strict";

import { renderDaftarObjek, renderHasilPeriksaObjek, renderDaftarBukti } from "../../src/application/services/render-investigasi.js";
import type { HasilSelidikiAdegan, HasilPeriksaObjek } from "../../src/domain/services/investigasi.js";

test("renderDaftarObjek menghasilkan keyboard satu tombol per object", () => {
  const hasil: HasilSelidikiAdegan = {
    sceneId: "ROOM_407",
    objekTampak: [
      { objectId: "OBJ_WATCH", sceneId: "ROOM_407", name: "Broken Watch", modeDiscovery: "AUTO", evidenceId: "E01" },
    ],
  };

  const pesan = renderDaftarObjek("s1", hasil);
  assert.match(pesan.text, /Broken Watch/);
  assert.equal(pesan.keyboard?.[0]?.[0]?.callback_data, "v1:inspect:s1:OBJ_WATCH");
});

test("renderHasilPeriksaObjek menampilkan pesan evidence baru", () => {
  const hasil: HasilPeriksaObjek = {
    sesi: {} as any,
    observasi: { observationId: "OBS_WATCH", objectId: "OBJ_WATCH", text: "Jam tangan pecah." },
    evidenceBaruDitemukan: true,
    evidenceId: "E01",
    sudahDiperiksaSebelumnya: false,
  };

  const pesan = renderHasilPeriksaObjek(hasil, "Broken Watch");
  assert.match(pesan.text, /Evidence ditemukan: E01/);
});

test("renderHasilPeriksaObjek menampilkan pesan duplicate tanpa reward baru", () => {
  const hasil: HasilPeriksaObjek = {
    sesi: {} as any,
    observasi: { observationId: "OBS_WATCH", objectId: "OBJ_WATCH", text: "Jam tangan pecah." },
    evidenceBaruDitemukan: false,
    evidenceId: "E01",
    sudahDiperiksaSebelumnya: true,
  };

  const pesan = renderHasilPeriksaObjek(hasil, "Broken Watch");
  assert.match(pesan.text, /sudah diperiksa sebelumnya/i);
});

test("renderDaftarBukti menampilkan pesan kosong jika belum ada evidence", () => {
  const pesan = renderDaftarBukti([]);
  assert.match(pesan.text, /Belum ada evidence/);
});