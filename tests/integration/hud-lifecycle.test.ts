import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan } from "./setup-komposisi.js";

const CHAT = "-1001";
const ADMIN = `${CHAT}:42`;

/**
 * M3/M4 — HUD lifecycle: /startcase kirim narasi + HUD + pin + simpan
 * hudMessageId; mutasi gameplay refresh HUD; /finalize unpin.
 */
test("HUD: startcase kirim narasi + HUD + pin + simpan hudMessageId", async () => {
  const ctx = buatKomposisiUji({ [ADMIN]: "administrator" });
  await seedVersiKasusTerbitan(ctx.komposisi);
  await prosesPerintah(ctx.komposisi, 801, "/newcase", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 802, "/join", CHAT, 43);
  const mulai = await prosesPerintah(ctx.komposisi, 803, "/startcase", CHAT, 42);
  assert.equal(mulai.status, "berhasil");

  const kirim = ctx.telegram.panggilan.filter((p) => p.metode === "sendMessage");
  assert.ok(kirim.some((p) => String(p.payload.text).includes("Jonathan Reed")), "narasi pembuka dari case data");
  const hud = kirim.find((p) => String(p.payload.text).includes("Investigation:"));
  assert.ok(hud, "HUD terkirim");
  assert.ok((hud?.payload.reply_markup as Record<string, unknown>)?.inline_keyboard, "HUD punya keyboard");

  const pin = ctx.telegram.panggilan.find((p) => p.metode === "pinChatMessage");
  assert.ok(pin, "HUD di-pin");

  const sesiDoc = ctx.firestore.semuaDokumen("case_sessions")[0] as Record<string, unknown> | undefined;
  assert.ok(sesiDoc?.hudMessageId, "hudMessageId tersimpan di sesi");
});

test("HUD: finalize unpin HUD + pesan resolusi tetap ada", async () => {
  const ctx = buatKomposisiUji({ [ADMIN]: "administrator", [`${CHAT}:43`]: "member" });
  await seedVersiKasusTerbitan(ctx.komposisi);
  await prosesPerintah(ctx.komposisi, 811, "/newcase", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 812, "/startcase", CHAT, 42);
  // jalur cepat ke proposal: accuse + 2 vote + finalize via command
  await prosesPerintah(ctx.komposisi, 813, "/accuse S01", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 814, "/vote", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 815, "/vote", CHAT, 43);
  const fin = await prosesPerintah(ctx.komposisi, 816, "/finalize", CHAT, 42);
  assert.equal(fin.status, "berhasil");

  const unpin = ctx.telegram.panggilan.find((p) => p.metode === "unpinChatMessage");
  assert.ok(unpin, "HUD di-unpin saat CLEARED");
  const resolusi = ctx.telegram.panggilan.find((p) => p.metode === "sendMessage" && String(p.payload.text).includes("Final accusation"));
  assert.ok(resolusi, "pesan resolusi tetap ada (tidak dihapus)");
});

test("HUD: inspect evidence baru refresh HUD (editMessageText)", async () => {
  const ctx = buatKomposisiUji({ [ADMIN]: "administrator" });
  await seedVersiKasusTerbitan(ctx.komposisi);
  await prosesPerintah(ctx.komposisi, 821, "/newcase", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 822, "/startcase", CHAT, 42);
  const editsSebelum = ctx.telegram.panggilan.filter((p) => p.metode === "editMessageText").length;
  await prosesPerintah(ctx.komposisi, 823, "/investigate ROOM_407", CHAT, 42);
  await prosesPerintah(ctx.komposisi, 824, "/inspect OBJ_WATCH", CHAT, 42);
  const editsSesudah = ctx.telegram.panggilan.filter((p) => p.metode === "editMessageText").length;
  assert.ok(editsSesudah > editsSebelum, "HUD di-refresh via edit setelah evidence baru");
});
