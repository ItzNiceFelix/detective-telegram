import test from "node:test";
import assert from "node:assert/strict";

import { TelegramAdapter, buatPengirimTelegram } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { KesalahanIntegrasi, KesalahanKonfigurasi } from "../../src/fondasi/eror.js";
import { buatFetchTelegramPalsu } from "./fake-telegram.js";

const TOKEN = "12345:TEST-TOKEN";

test("kirimPesanTelegram memanggil Bot API sendMessage dengan chat_id + text", async () => {
  const { fetchImpl, panggilan } = buatFetchTelegramPalsu();
  const pengirim = buatPengirimTelegram({ botToken: TOKEN, fetchImpl });

  await pengirim.kirimPesanTelegram("-1001", "Halo tim.");

  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0]?.metode, "sendMessage");
  assert.equal(panggilan[0]?.payload.chat_id, "-1001");
  assert.equal(panggilan[0]?.payload.text, "Halo tim.");
  assert.match(panggilan[0]?.url ?? "", /\/bot12345:TEST-TOKEN\/sendMessage$/);
});

test("kirim (interface lama) memetakan ResponTelegram ke sendMessage", async () => {
  const { fetchImpl, panggilan } = buatFetchTelegramPalsu();
  const adapter = new TelegramAdapter({ botToken: TOKEN, fetchImpl });

  await adapter.kirim({ chatId: "-42", text: "Status diperbarui." });

  assert.equal(panggilan[0]?.payload.chat_id, "-42");
  assert.equal(panggilan[0]?.payload.text, "Status diperbarui.");
});

test("HTTP error menghasilkan KesalahanIntegrasi terstruktur", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 500 });
  const pengirim = buatPengirimTelegram({ botToken: TOKEN, fetchImpl });

  await assert.rejects(() => pengirim.kirimPesanTelegram("-1", "tes"), (error: unknown) => {
    assert.ok(error instanceof KesalahanIntegrasi);
    assert.match(error.message, /HTTP 500/);
    return true;
  });
});

test("Telegram API ok=false menghasilkan KesalahanIntegrasi", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error_code: 403, description: "bot was blocked" }), { status: 200 });
  const pengirim = buatPengirimTelegram({ botToken: TOKEN, fetchImpl });

  await assert.rejects(() => pengirim.kirimPesanTelegram("-1", "tes"), (error: unknown) => {
    assert.ok(error instanceof KesalahanIntegrasi);
    assert.match(error.message, /ok=false/);
    assert.match(error.message, /bot was blocked/);
    return true;
  });
});

test("respons malformed (bukan JSON / tanpa ok boolean) menghasilkan KesalahanIntegrasi", async () => {
  const fetchImplBukanJson: typeof fetch = async () => new Response("<html>oops</html>", { status: 200 });
  const pengirim1 = buatPengirimTelegram({ botToken: TOKEN, fetchImpl: fetchImplBukanJson });

  await assert.rejects(() => pengirim1.kirimPesanTelegram("-1", "tes"), KesalahanIntegrasi);

  const fetchImplTanpaOk: typeof fetch = async () => new Response(JSON.stringify({ result: {} }), { status: 200 });
  const pengirim2 = buatPengirimTelegram({ botToken: TOKEN, fetchImpl: fetchImplTanpaOk });

  await assert.rejects(() => pengirim2.kirimPesanTelegram("-1", "tes"), (error: unknown) => {
    assert.ok(error instanceof KesalahanIntegrasi);
    assert.match(error.message, /malformed/);
    return true;
  });
});

test("network error dan timeout menghasilkan KesalahanIntegrasi", async () => {
  const fetchGagal: typeof fetch = async () => {
    throw new Error("ECONNRESET");
  };
  const pengirim1 = buatPengirimTelegram({ botToken: TOKEN, fetchImpl: fetchGagal });
  await assert.rejects(() => pengirim1.kirimPesanTelegram("-1", "tes"), KesalahanIntegrasi);

  const fetchTimeout: typeof fetch = async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  };
  const pengirim2 = buatPengirimTelegram({ botToken: TOKEN, fetchImpl: fetchTimeout });
  await assert.rejects(() => pengirim2.kirimPesanTelegram("-1", "tes"), (error: unknown) => {
    assert.ok(error instanceof KesalahanIntegrasi);
    assert.match(error.message, /timeout/i);
    return true;
  });
});

test("token tidak pernah bocor ke pesan error", async () => {
  const fetchGagal: typeof fetch = async () => {
    throw new Error("boom");
  };
  const pengirim = buatPengirimTelegram({ botToken: TOKEN, fetchImpl: fetchGagal });

  try {
    await pengirim.kirimPesanTelegram("-1", "tes");
    assert.fail("harusnya throw");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes(TOKEN), false);
    assert.equal(error.message.includes("bot12345"), false);
  }
});

test("bot token kosong menghasilkan KesalahanKonfigurasi", async () => {
  const pengirim = buatPengirimTelegram({ botToken: "", fetchImpl: buatFetchTelegramPalsu().fetchImpl });
  await assert.rejects(() => pengirim.kirimPesanTelegram("-1", "tes"), KesalahanKonfigurasi);
});

test("ambilStatusAnggota mengembalikan null ketika API gagal (fail-closed di validator)", async () => {
  const { fetchImpl, gagalkanMetode } = buatFetchTelegramPalsu({ "-1001:42": "member" });
  gagalkanMetode("getChatMember", new Error("API down"));
  const pengirim = buatPengirimTelegram({ botToken: TOKEN, fetchImpl });

  const status = await pengirim.ambilStatusAnggota("-1001", "42");
  assert.equal(status, null);
});