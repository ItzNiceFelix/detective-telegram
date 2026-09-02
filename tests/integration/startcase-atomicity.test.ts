import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi, JenisKejadianDomain } from "../../src/domain/enums.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan } from "./setup-komposisi.js";

const CHAT = "-1001";
const ADMIN = `${CHAT}:42`;
const MEMBER = `${CHAT}:43`;

async function siapkanSesiLobby(statusAnggota: Record<string, string>) {
  const ctx = buatKomposisiUji(statusAnggota);
  await seedVersiKasusTerbitan(ctx.komposisi);
  const buat = await prosesPerintah(ctx.komposisi, 61, "/newcase", CHAT, 42);
  assert.equal(buat.status, "berhasil");
  return ctx;
}

test("/startcase oleh admin: LOBBY → OPEN + tepat satu event CASE_STARTED", async () => {
  const { firestore, telegram, komposisi } = await siapkanSesiLobby({ [ADMIN]: "administrator", [MEMBER]: "member" });

  const hasil = await prosesPerintah(komposisi, 62, "/startcase", CHAT, 42);

  assert.equal(hasil.status, "berhasil");
  if (hasil.status !== "berhasil") return;
  assert.equal(hasil.data.session?.status, StatusSesi.OPEN);
  assert.ok(hasil.data.session?.startedAt);

  const sessionId = String(hasil.data.session.sessionId);
  const event = firestore.ambilDokumen(`case_sessions/${sessionId}/events`, "evt-telegram:update:62-CASE_STARTED");
  assert.ok(event);
  assert.equal(event?.type, JenisKejadianDomain.CASE_STARTED);

  const kirim = telegram.panggilan.find((p) => p.metode === "sendMessage" && String(p.payload.text).includes("Case dimulai"));
  assert.ok(kirim);
});

test("/startcase oleh non-admin ditolak sebelum mutasi", async () => {
  const { firestore, komposisi } = await siapkanSesiLobby({ [ADMIN]: "administrator", [MEMBER]: "member" });

  const hasil = await prosesPerintah(komposisi, 63, "/startcase", CHAT, 43);

  assert.equal(hasil.status, "gagal");
  if (hasil.status === "gagal") {
    assert.match(hasil.error.message, /admin/);
  }

  // Sesi tetap LOBBY, tidak ada event CASE_STARTED.
  const sesi = firestore.semuaDokumen("case_sessions");
  assert.equal(sesi.length, 1);
  assert.equal(sesi[0]?.status, StatusSesi.LOBBY);
  const events = firestore.semuaDokumen(`case_sessions/${String(sesi[0]?.sessionId)}/events`);
  assert.equal(events.some((e) => e.type === JenisKejadianDomain.CASE_STARTED), false);
});

test("/startcase concurrent A+B: hanya satu transisi LOBBY → OPEN yang valid", async () => {
  const { firestore, komposisi } = await siapkanSesiLobby({ [ADMIN]: "administrator", [`${CHAT}:44`]: "administrator" });

  const [a, b] = await Promise.all([
    prosesPerintah(komposisi, 64, "/startcase", CHAT, 42),
    prosesPerintah(komposisi, 65, "/startcase", CHAT, 44),
  ]);

  const sukses = [a, b].filter((h) => h.status === "berhasil");
  assert.equal(sukses.length, 1, "tepat satu admin yang menang");

  const sessionId = String((sukses[0] as { data: { session?: { sessionId: unknown } } }).data.session?.sessionId);
  const events = firestore.semuaDokumen(`case_sessions/${sessionId}/events`);
  const jumlahStarted = events.filter((e) => e.type === JenisKejadianDomain.CASE_STARTED).length;
  assert.equal(jumlahStarted, 1, "tidak boleh dua canonical CASE_STARTED");
});

test("/startcase duplicate update yang sama → safe replay, tanpa mutasi kedua", async () => {
  const { firestore, komposisi } = await siapkanSesiLobby({ [ADMIN]: "administrator" });

  const pertama = await prosesPerintah(komposisi, 66, "/startcase", CHAT, 42);
  assert.equal(pertama.status, "berhasil");

  const ulang = await prosesPerintah(komposisi, 66, "/startcase", CHAT, 42);
  assert.equal(ulang.status, "berhasil");
  if (ulang.status === "berhasil") {
    assert.match(ulang.data.message, /sudah diproses/);
  }

  const events = firestore.semuaDokumen("case_sessions/-1001:CASE-001:61/events");
  const jumlahStarted = events.filter((e) => e.type === JenisKejadianDomain.CASE_STARTED).length;
  assert.equal(jumlahStarted, 1, "duplicate tidak boleh membuat CASE_STARTED kedua");
});

test("/startcase tanpa sesi aktif ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [ADMIN]: "administrator" });
  await seedVersiKasusTerbitan(komposisi);

  const hasil = await prosesPerintah(komposisi, 67, "/startcase", CHAT, 42);
  assert.equal(hasil.status, "gagal");
  if (hasil.status === "gagal") {
    assert.match(hasil.error.message, /Tidak ada sesi aktif/);
  }
});