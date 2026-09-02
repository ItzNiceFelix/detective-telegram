import test from "node:test";
import assert from "node:assert/strict";

import type { Firestore } from "firebase-admin/firestore";
import { buatKomposisiAplikasi, dapatkanKomposisiAplikasi, aturUlangKomposisiAplikasi } from "../../src/komposisi/komposisi-aplikasi.js";
import { KomandoTelegramLayanan } from "../../src/application/services/komando-telegram.js";
import { RepositoriSesiFirestore } from "../../src/infrastructure/repositories/firestore/repositori-sesi.js";
import { RepositoriGrupFirestore } from "../../src/infrastructure/repositories/firestore/repositori-grup.js";
import { RepositoriIdempotenFirestore } from "../../src/infrastructure/repositories/firestore/repositori-idempoten.js";
import { PenerbitAcaraDomainFirestore } from "../../src/infrastructure/events/penerbit-acara-domain.js";
import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { FirestorePalsu } from "./fake-firestore.js";
import { buatFetchTelegramPalsu } from "./fake-telegram.js";

test("buatKomposisiAplikasi merakit seluruh dependency runtime dari satu tempat", () => {
  const { komposisi } = ((): { komposisi: ReturnType<typeof buatKomposisiAplikasi>; firestore: FirestorePalsu } => {
    const firestore = new FirestorePalsu();
    const telegram = buatFetchTelegramPalsu();
    const komposisi = buatKomposisiAplikasi({
      firestore: firestore as unknown as Firestore,
      pengirimTelegram: { botToken: "TEST-TOKEN", fetchImpl: telegram.fetchImpl },
    });
    return { komposisi, firestore };
  })();

  assert.ok(komposisi.repositoriSesiKasus instanceof RepositoriSesiFirestore);
  assert.ok(komposisi.repositoriGrup instanceof RepositoriGrupFirestore);
  assert.ok(komposisi.repositoriIdempoten instanceof RepositoriIdempotenFirestore);
  assert.ok(komposisi.penerbitEventDomain instanceof PenerbitAcaraDomainFirestore);
  assert.ok(komposisi.pengirimTelegram instanceof TelegramAdapter);
  assert.ok(komposisi.layananKomando instanceof KomandoTelegramLayanan);
  assert.ok(komposisi.repositoriPengguna, "repositori pengguna ikut tersusun");
  assert.ok(komposisi.validatorGrupTelegram, "validator grup ter-wiring (bukan return true)");
  assert.ok(komposisi.validatorAksesTelegram, "validator akses ter-wiring (bukan return true)");
  assert.ok(komposisi.validatorAdminGrupTelegram, "validator admin ter-wiring");
  assert.ok(komposisi.penghitungBatasKejadian, "rate limiter ter-wiring");
});

test("dapatkanKomposisiAplikasi memoized — warm invocation memakai instance yang sama", () => {
  aturUlangKomposisiAplikasi();

  const firestore = new FirestorePalsu();
  const telegram = buatFetchTelegramPalsu();
  const opsi = {
    firestore: firestore as unknown as Firestore,
    pengirimTelegram: { botToken: "TEST-TOKEN", fetchImpl: telegram.fetchImpl },
  };

  const pertama = dapatkanKomposisiAplikasi(opsi);
  const kedua = dapatkanKomposisiAplikasi();
  assert.equal(pertama, kedua, "instance harus dipakai ulang tanpa koneksi baru");

  aturUlangKomposisiAplikasi();
  const ketiga = dapatkanKomposisiAplikasi(opsi);
  assert.notEqual(pertama, ketiga, "reset harus menghasilkan komposisi baru");
  aturUlangKomposisiAplikasi();
});