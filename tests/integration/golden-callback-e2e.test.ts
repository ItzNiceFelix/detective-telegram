import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi, HasilSesi } from "../../src/domain/enums.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan, type KomposisiUji } from "./setup-komposisi.js";
import type { SesiKasus } from "../../src/domain/entities.js";

const CHAT = "-1001";

function prosesCallback(ctx: KomposisiUji, updateId: number, userId: number, data: string) {
  return ctx.komposisi.layananKomando.prosesUpdate(
    ctx.komposisi.pengirimTelegram.parseUpdate({
      update_id: updateId,
      callback_query: {
        id: `cb-${updateId}`,
        data,
        from: { id: userId, username: `u${userId}` },
        message: { message_id: 1, chat: { id: Number(CHAT), type: "supergroup" } },
      },
    }),
  );
}

/**
 * M4 — FULL GOLDEN PLAYABLE via CALLBACK: newcase → startcase (+HUD/pin) →
 * investigate → inspect → interogasi → konfrontasi → teori → tuduhan →
 * vote → konfirmasi → finalize → CLEARED+SOLVED + unpin.
 */
test("GOLDEN via CALLBACK: alur lengkap playable sampai SOLVED + unpin", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator", [`${CHAT}:43`]: "member" });
  await seedVersiKasusTerbitan(ctx.komposisi);
  assert.equal((await prosesPerintah(ctx.komposisi, 951, "/newcase", CHAT, 42)).status, "berhasil");
  assert.equal((await prosesPerintah(ctx.komposisi, 952, "/join", CHAT, 43)).status, "berhasil");
  assert.equal((await prosesPerintah(ctx.komposisi, 953, "/startcase", CHAT, 42)).status, "berhasil");

  assert.ok(ctx.telegram.panggilan.some((p) => p.metode === "pinChatMessage"), "HUD di-pin saat start");

  assert.equal((await prosesCallback(ctx, 954, 42, "v1:investigate:ROOM_407")).status, "berhasil");
  for (const [uid, obj] of [[955, "OBJ_WATCH"], [956, "OBJ_FOOTPRINTS"], [957, "OBJ_WINDOW"], [958, "OBJ_CCTV"]] as const) {
    assert.equal((await prosesCallback(ctx, uid, 42, `v1:inspect:${obj}`)).status, "berhasil");
  }
  assert.equal((await prosesCallback(ctx, 959, 42, "v1:interrogate_maksud:S01:ASK_ALIBI")).status, "berhasil");
  assert.equal((await prosesCallback(ctx, 960, 42, "v1:confront_evidence:S01:E04")).status, "berhasil");

  const sesiTengah = ctx.firestore.semuaDokumen("case_sessions")[0] as unknown as SesiKasus;
  assert.ok(sesiTengah.discoveredContradictionIds.includes("CONTRA_01"));
  assert.ok(sesiTengah.knownTimelineEventIds.includes("T02"));

  assert.equal((await prosesCallback(ctx, 961, 42, "v1:theory:S01")).status, "berhasil");
  assert.equal((await prosesCallback(ctx, 962, 42, "v1:accuse:S01")).status, "berhasil");
  assert.equal((await prosesCallback(ctx, 963, 43, "v1:vote")).status, "berhasil");
  assert.equal((await prosesCallback(ctx, 964, 42, "v1:vote")).status, "berhasil");
  assert.equal((await prosesCallback(ctx, 965, 42, "v1:confirm_finalize")).status, "berhasil");

  const sesi = ctx.firestore.semuaDokumen("case_sessions")[0] as unknown as SesiKasus;
  assert.equal(sesi.status, StatusSesi.CLEARED);
  assert.equal(sesi.outcome, HasilSesi.SOLVED);
  assert.ok(sesi.finalAccusation?.correctCulprit);
  assert.ok(ctx.telegram.panggilan.some((p) => p.metode === "unpinChatMessage"), "HUD di-unpin saat CLEARED");
});
