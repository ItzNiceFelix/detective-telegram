import test from "node:test";
import assert from "node:assert/strict";

import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";

/**
 * M1 — adapter callback Telegram: parse callback_query (actor dari `from`,
 * bukan data), keyboard lifecycle (send/edit/answer/pin/unpin/delete).
 */
function adapterUji(panggil: Array<{ metode: string; payload: Record<string, unknown> }>): TelegramAdapter {
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const metode = url.split("/").pop() ?? "";
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    panggil.push({ metode, payload });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
  }) as typeof fetch;
  return new TelegramAdapter({ botToken: "T", fetchImpl });
}

test("parseUpdate callback_query: actor dari from, data utuh, messageId terekstrak", () => {
  const adapter = adapterUji([]);
  const req = adapter.parseUpdate({
    update_id: 100,
    callback_query: {
      id: "cb-1",
      data: "v1:inspect:s1:OBJ_1",
      from: { id: 42, username: "felix" },
      message: { message_id: 55, chat: { id: -1001, type: "supergroup" } },
    },
  });
  assert.equal(req.userId, "42");
  assert.equal(req.chatId, "-1001");
  assert.equal(req.callback?.callbackId, "cb-1");
  assert.equal(req.callback?.data, "v1:inspect:s1:OBJ_1");
  assert.equal(req.callback?.messageId, 55);
});

test("parseUpdate callback tanpa data → callback undefined (bukan crash)", () => {
  const adapter = adapterUji([]);
  const req = adapter.parseUpdate({ update_id: 101, callback_query: { id: "cb-2", from: { id: 1 } } });
  assert.equal(req.callback, undefined);
});

test("serialisasiKibord memetakan teks/data ke Bot API", () => {
  const adapter = adapterUji([]);
  const out = adapter.serialisasiKibord([[{ teks: "A", data: "v1:a" }], [{ teks: "B", data: "v1:b" }, { teks: "C", data: "v1:c" }]]);
  assert.deepEqual(out, [
    [{ text: "A", callback_data: "v1:a" }],
    [{ text: "B", callback_data: "v1:b" }, { text: "C", callback_data: "v1:c" }],
  ]);
});

test("kirimPesanKibord → sendMessage + reply_markup + message_id", async () => {
  const panggil: Array<{ metode: string; payload: Record<string, unknown> }> = [];
  const adapter = adapterUji(panggil);
  const id = await adapter.kirimPesanKibord("-1001", "Halo", [[{ teks: "A", data: "v1:a" }]]);
  assert.equal(id, 7);
  assert.equal(panggil[0]?.metode, "sendMessage");
  const markup = (panggil[0]?.payload.reply_markup ?? {}) as Record<string, unknown>;
  assert.deepEqual(markup, { inline_keyboard: [[{ text: "A", callback_data: "v1:a" }]] });
});

test("suntingPesanKibord + jawabCallback + semat/lucuti/padam memanggil metode tepat", async () => {
  const panggil: Array<{ metode: string; payload: Record<string, unknown> }> = [];
  const adapter = adapterUji(panggil);
  await adapter.suntingPesanKibord("-1001", 9, "Menu", [[{ teks: "A", data: "v1:a" }]]);
  await adapter.jawabCallback("cb-9", "ok");
  await adapter.sematkanPesan("-1001", 9);
  await adapter.lucutiSematPesan("-1001", 9);
  await adapter.padamPesan("-1001", 9);
  assert.deepEqual(panggil.map((p) => p.metode), [
    "editMessageText",
    "answerCallbackQuery",
    "pinChatMessage",
    "unpinChatMessage",
    "deleteMessage",
  ]);
});

test("jawabCallback gagal → tidak melempar (best-effort)", async () => {
  const fetchImpl = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  const adapter = new TelegramAdapter({ botToken: "T", fetchImpl });
  await adapter.jawabCallback("cb-x");
});
