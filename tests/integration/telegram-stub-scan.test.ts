import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * TELEGRAM — verifikasi /api/telegram.ts adalah thin entrypoint produksi:
 * tidak ada inline stub, fake repository, no-op sender, atau business logic.
 */
test("TELEGRAM: api/telegram.ts bebas dari inline stub & business logic", async () => {
  const sumber = await readFile(new URL("../../api/telegram.ts", import.meta.url), "utf8");

  const polaStub = [
    /async \(\) => null/,
    /async \(\) => undefined/,
    /\(transaction: any\)/,
    /stub-chat-id/,
    /"stub-update-id"/,
    /new TelegramAdapter\(\)/,
    /new KomandoTelegramLayanan\(/,
  ];

  for (const pola of polaStub) {
    assert.doesNotMatch(sumber, pola, `ditemukan pola stub: ${pola}`);
  }

  // Handler hanya meng-import composition root + validasi webhook (bukan repository/bisnis).
  assert.match(sumber, /dapatkanKomposisiAplikasi/);
  assert.match(sumber, /validasiWebhookSecret/);
  assert.doesNotMatch(sumber, /firebase-admin/);
  assert.doesNotMatch(sumber, /repositori/i);
});

test("TELEGRAM: komposisi root yang di-wire adalah implementasi nyata (bukan fake)", async () => {
  const src = await readFile(new URL("../../src/komposisi/komposisi-aplikasi.ts", import.meta.url), "utf8");
  assert.match(src, /buatBootstrapFirestore/);
  assert.match(src, /RepositoriSesiFirestore/);
  assert.match(src, /PenerbitAcaraDomainFirestore/);
  assert.match(src, /ValidatorGrupTelegram/);
});