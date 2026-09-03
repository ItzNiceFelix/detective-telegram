import test from "node:test";
import assert from "node:assert/strict";

import type { Firestore } from "firebase-admin/firestore";
import handlerDefault, { handlerInternal } from "../../api/telegram.js";
import { aturUlangKomposisiAplikasi, dapatkanKomposisiAplikasi } from "../../src/komposisi/komposisi-aplikasi.js";
import { FirestorePalsu } from "./fake-firestore.js";
import { buatFetchTelegramPalsu, buatVersiKasusEmasTerbitan } from "./fake-telegram.js";

const SECRET_LAMA = process.env.TELEGRAM_SECRET;

// Import default handler untuk verifikasi eksistensi (tanpa dipanggil langsung di sini).
void handlerDefault;

function siapkan(opsi: { statusAnggota?: Record<string, string>; maxPermintaan?: number } = {}) {
  aturUlangKomposisiAplikasi();
  const firestore = new FirestorePalsu();
  const telegram = buatFetchTelegramPalsu(opsi.statusAnggota ?? {});
  dapatkanKomposisiAplikasi({
    firestore: firestore as unknown as Firestore,
    pengirimTelegram: { botToken: "TEST-TOKEN", fetchImpl: telegram.fetchImpl },
    batasRate: { maxPermintaan: opsi.maxPermintaan ?? 100, jendelaMs: 60_000 },
  });
  process.env.TELEGRAM_SECRET = "secret-test-123";
  return { firestore, telegram };
}

function permintaanWebhook(body: unknown, secret = "secret-test-123") {
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(body),
  };
}

/** Buat mock response untuk menangkap output handler default. */
function buatMockResponse(): { res: Record<string, unknown>; status: number; body: string; headers: Record<string, string> } {
  const result = { status: 200, body: "", headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => { result.headers[k] = v; },
    status: (s: number) => { result.status = s; return res; },
    send: (b: string) => { result.body = b; },
  } as unknown as Record<string, unknown>;
  return { res, ...result };
}

test.afterEach(() => {
  aturUlangKomposisiAplikasi();
  if (SECRET_LAMA === undefined) {
    delete process.env.TELEGRAM_SECRET;
  } else {
    process.env.TELEGRAM_SECRET = SECRET_LAMA;
  }
});

test("GET â†’ readiness tanpa menyentuh business logic", async () => {
  siapkan();
  const hasil = await handlerInternal({ method: "GET" });
  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { ok: boolean; status: string };
  assert.equal(body.ok, true);
  assert.equal(body.status, "ready");
});

test("webhook secret invalid â†’ 401", async () => {
  siapkan();
  const hasil = await handlerInternal(permintaanWebhook({ update_id: 1 }, "secret-salah"));
  assert.equal(hasil.status, 401);
});

test("webhook secret hilang â†’ 401", async () => {
  siapkan();
  const hasil = await handlerInternal({ method: "POST", headers: {}, body: JSON.stringify({ update_id: 1 }) });
  assert.equal(hasil.status, 401);
});

test("update tanpa message (mis. my_chat_member/edited_message) â†' 200 ignored tanpa mutasi", async () => {
  // Locked contract (api/telegram.ts): update dengan update_id valid tapi tanpa
  // konten message/callback_query dianggap ack (200 ignored) supaya Telegram
  // tidak menahan antrian dengan retry â€" bukan error. Payload tsb BUKAN 400;
  // 400 hanya untuk JSON rusak, body kosong, atau update_id tidak ada.
  const { firestore } = siapkan();
  const hasil = await handlerInternal(permintaanWebhook({ update_id: 2 }));
  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { ok?: boolean; ignored?: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.ignored, true);
  assert.equal(firestore.jumlahDokumen("case_sessions"), 0);
});

test("JSON payload rusak â†’ 400", async () => {
  siapkan();
  const hasil = await handlerInternal({ method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret-test-123" }, body: "{bukan-json" });
  assert.equal(hasil.status, 400);
});

test("/start di grup menghasilkan outbound sendMessage", async () => {
  const { firestore, telegram } = siapkan({ statusAnggota: { "-1001:42": "member" } });
  await dapatkanKomposisiAplikasi().repositoriVersiKasus.simpanVersiKasus(buatVersiKasusEmasTerbitan());

  const hasil = await handlerInternal(permintaanWebhook({
    update_id: 3,
    message: { message_id: 3, text: "/start", chat: { id: -1001, type: "group" }, from: { id: 42, username: "u" } },
  }));

  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { ok: boolean; command: string };
  assert.equal(body.ok, true);
  assert.equal(body.command, "/start");

  const kirim = telegram.panggilan.find((p) => p.metode === "sendMessage");
  assert.ok(kirim, "/start harus memproduksi outbound sendMessage");
  assert.equal(kirim?.payload.chat_id, "-1001");

  // /start mendaftarkan grup (validasi group real, bukan stub).
  assert.ok(firestore.ambilDokumen("groups", "-1001"));
});

test("kegagalan Telegram API setelah commit â†’ canonical state tetap, HTTP 200 aman", async () => {
  const { firestore, telegram } = siapkan({ statusAnggota: { "-1001:42": "member" } });
  await dapatkanKomposisiAplikasi().repositoriVersiKasus.simpanVersiKasus(buatVersiKasusEmasTerbitan());

  telegram.gagalkanMetode("sendMessage", new Error("telegram down"));

  const hasil = await handlerInternal(permintaanWebhook({
    update_id: 4,
    message: { message_id: 4, text: "/newcase", chat: { id: -1001, type: "group" }, from: { id: 42, username: "u" } },
  }));

  // Response tetap aman (200) â€” tidak ada rollback canonical state.
  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { ok: boolean };
  assert.equal(body.ok, true);

  // Mutasi kanonik tetap ter-commit.
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1);

  // Retry Telegram dengan update yang sama â†’ idempotent, tidak ada mutasi kedua.
  telegram.gagalkanMetode("sendMessage", new Error("telegram down"));
  const ulang = await handlerInternal(permintaanWebhook({
    update_id: 4,
    message: { message_id: 4, text: "/newcase", chat: { id: -1001, type: "group" }, from: { id: 42, username: "u" } },
  }));
  assert.equal(ulang.status, 200);
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1, "duplicate update tidak melakukan mutasi kedua");
});

test("rate limit per IP â†’ 429", async () => {
  siapkan({ maxPermintaan: 2 });
  const body = { update_id: 5, message: { message_id: 5, text: "halo", chat: { id: -1001, type: "group" }, from: { id: 42 } } };

  await handlerInternal(permintaanWebhook(body));
  await handlerInternal(permintaanWebhook({ ...body, update_id: 6 }));
  const ketiga = await handlerInternal(permintaanWebhook({ ...body, update_id: 7 }));

  assert.equal(ketiga.status, 429);
});
