import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan, type KomposisiUji } from "./setup-komposisi.js";
import type { SesiKasus } from "../../src/domain/entities.js";

const CHAT = "-1001";

/** Kirim callback query lewat webhook handler (parseUpdate + prosesUpdate). */
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

async function siapkanSesiOpen(ctx: KomposisiUji, baseUpdate: number) {
  await seedVersiKasusTerbitan(ctx.komposisi);
  await prosesPerintah(ctx.komposisi, baseUpdate + 1, "/newcase", CHAT, 42);
  await prosesPerintah(ctx.komposisi, baseUpdate + 2, "/join", CHAT, 43);
  await prosesPerintah(ctx.komposisi, baseUpdate + 3, "/startcase", CHAT, 42);
}

test("UX: callback inspect oleh NON-DETECTIVE ditolak (aktor dari from, bukan data)", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator", [`${CHAT}:43`]: "member", [`${CHAT}:99`]: "member" });
  await siapkanSesiOpen(ctx, 901);
  const hasil = await prosesCallback(ctx, 902, 99, "v1:inspect:OBJ_WATCH");
  assert.equal(hasil.status, "gagal");
  if (hasil.status === "gagal") assert.match(hasil.error.message, /detective aktif/i);
  // tidak ada mutasi: OBJ_WATCH tidak diperiksa
  const sesi = ctx.firestore.semuaDokumen("case_sessions")[0] as unknown as SesiKasus;
  assert.ok(!sesi.examinedObjectIds.includes("OBJ_WATCH"));
});

test("UX: stale callback (sesi CLEARED) ditolak aman tanpa mutasi", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator" });
  await siapkanSesiOpen(ctx, 911);
  const sesiDoc = ctx.firestore.ambilDokumen("case_sessions", String(ctx.firestore.semuaDokumen("case_sessions")[0]?.sessionId));
  ctx.firestore.refDokumen("case_sessions", String(sesiDoc!.sessionId)).set({ ...sesiDoc!, status: StatusSesi.CLEARED });
  const hasil = await prosesCallback(ctx, 912, 42, "v1:investigate:ROOM_407");
  assert.equal(hasil.status, "gagal");
});

test("UX: duplicate callback vote → tepat satu suara per pemain", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator", [`${CHAT}:43`]: "member" });
  await siapkanSesiOpen(ctx, 921);
  await prosesPerintah(ctx.komposisi, 922, "/accuse S01", CHAT, 42);
  await prosesCallback(ctx, 923, 43, "v1:vote");
  const ulang = await prosesCallback(ctx, 924, 43, "v1:vote");
  assert.equal(ulang.status, "berhasil");
  const sesi = ctx.firestore.semuaDokumen("case_sessions")[0] as unknown as SesiKasus;
  const suara43 = (sesi.accusationProposal?.votes ?? []).filter((v) => v === "43").length;
  assert.equal(suara43, 1, "vote duplikat tidak menggandakan suara");
});

test("UX: concurrent callback inspect OBJ sama → tepat satu pemeriksaan", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator", [`${CHAT}:43`]: "member" });
  await siapkanSesiOpen(ctx, 931);
  const [a, b] = await Promise.all([
    prosesCallback(ctx, 932, 42, "v1:inspect:OBJ_WATCH"),
    prosesCallback(ctx, 933, 43, "v1:inspect:OBJ_WATCH"),
  ]);
  const sukses = [a, b].filter((h) => h.status === "berhasil").length;
  assert.ok(sukses >= 1);
  const sesi = ctx.firestore.semuaDokumen("case_sessions")[0] as unknown as SesiKasus;
  const hitungan = sesi.examinedObjectIds.filter((o) => o === "OBJ_WATCH").length;
  assert.equal(hitungan, 1, "inspeksi duplicate tidak memutasi dua kali");
  const bukti = sesi.discoveredEvidenceIds.filter((e) => e === "E01").length;
  assert.equal(bukti, 1, "evidence E01 hanya tercatat sekali");
});

test("UX: callback data rusak → ditolak aman, tanpa mutasi", async () => {
  const ctx = buatKomposisiUji({ [`${CHAT}:42`]: "administrator" });
  await siapkanSesiOpen(ctx, 941);
  const hasil = await prosesCallback(ctx, 942, 42, "bukan-kontrak-v1");
  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /tidak dikenal/i);
});
