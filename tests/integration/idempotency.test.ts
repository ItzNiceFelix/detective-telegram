import test from "node:test";
import assert from "node:assert/strict";

import { RepositoriIdempotenFirestore } from "../../src/infrastructure/repositories/firestore/repositori-idempoten.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan } from "./setup-komposisi.js";
import { FirestorePalsu } from "./fake-firestore.js";

const CHAT = "-1001";

function buatRepositori(firestore: unknown): RepositoriIdempotenFirestore {
  return new RepositoriIdempotenFirestore(firestore as never);
}

test("klaimKunciIdempotensi: klaim pertama menang, klaim kedua dideteksi duplicate", async () => {
  const firestore = new FirestorePalsu();
  const repositori = buatRepositori(firestore);

  const pertama = await repositori.klaimKunci("telegram:update:100", "sesi-1" as never);
  assert.equal(pertama.sudahAda, false);

  const kedua = await repositori.klaimKunci("telegram:update:100", "sesi-1" as never);
  assert.equal(kedua.sudahAda, true);

  // Key format sesuai kontrak telegram:update:{updateId}.
  assert.equal(repositori.buatKunciUpdateTelegram("100"), "telegram:update:100");
  assert.ok(firestore.ambilDokumen("idempotency_keys", "telegram:update:100"));
});

test("klaim atomic dalam transaction: duplicate concurrent hanya satu yang menang", async () => {
  const firestore = new FirestorePalsu();
  const repositori = buatRepositori(firestore);

  const hasil = await Promise.all([
    firestore.runTransaction((tx) => repositori.klaimKunci("telegram:update:200", "sesi-1" as never, tx)),
    firestore.runTransaction((tx) => repositori.klaimKunci("telegram:update:200", "sesi-1" as never, tx)),
  ]);

  const pemenang = hasil.filter((h) => h.sudahAda === false);
  assert.equal(pemenang.length, 1, "hanya satu klaim yang boleh menang");
  assert.equal(firestore.jumlahDokumen("idempotency_keys"), 1);
});

test("dokumen idempotensi bounded — tanpa payload Telegram", async () => {
  const firestore = new FirestorePalsu();
  const repositori = buatRepositori(firestore);

  await repositori.klaimKunci("telegram:update:300", "sesi-1" as never);

  const data = firestore.ambilDokumen("idempotency_keys", "telegram:update:300");
  assert.deepEqual(Object.keys(data ?? {}).sort(), ["actionId", "createdAt", "repeated", "sessionId"].sort());
});

test("duplicate /newcase delivery: mutation tidak dijalankan lagi", async () => {
  const { firestore, komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const pertama = await prosesPerintah(komposisi, 400, "/newcase");
  assert.equal(pertama.status, "berhasil");
  const sesiPertama = firestore.semuaDokumen("case_sessions");

  const ulang = await prosesPerintah(komposisi, 400, "/newcase");
  assert.equal(ulang.status, "berhasil");

  assert.equal(firestore.semuaDokumen("case_sessions").length, sesiPertama.length, "tidak ada sesi kedua");
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1);
});

test("duplicate concurrent /newcase dengan update yang sama: hanya satu mutasi", async () => {
  const { firestore, komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const [a, b] = await Promise.all([
    prosesPerintah(komposisi, 500, "/newcase"),
    prosesPerintah(komposisi, 500, "/newcase"),
  ]);

  const berhasil = [a, b].filter((h) => h.status === "berhasil");
  if (berhasil.length !== 2) {
    const gagalDetail = [a, b].filter((h) => h.status === "gagal").map((h) => (h.status === "gagal" ? `${h.error.name}: ${h.error.message}` : ""));
    assert.fail(`keduanya harus sukses. Detail gagal: ${gagalDetail.join(" | ")}`);
  }
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1, "tepat satu sesi");
  assert.equal(firestore.jumlahDokumen("idempotency_keys"), 1, "tepat satu kunci");
});