import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatKomposisiUji, prosesPerintah, seedVersiKasusTerbitan } from "./setup-komposisi.js";

const CHAT = "-1001";
const KUNCI_ADMIN = `${CHAT}:42`;

test("/newcase normal: membuat satu sesi LOBBY + pointer grup + event + kunci idempotensi", async () => {
  const { firestore, telegram, komposisi } = buatKomposisiUji({ [KUNCI_ADMIN]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const hasil = await prosesPerintah(komposisi, 11, "/newcase");

  assert.equal(hasil.status, "berhasil");
  if (hasil.status !== "berhasil") return;

  assert.equal(hasil.data.session?.status, StatusSesi.LOBBY);
  const sessionId = String(hasil.data.session?.sessionId);

  // Sesi tersimpan tepat satu.
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1);

  // Pointer grup aktif menunjuk sesi baru (field existing).
  const grup = firestore.ambilDokumen("groups", CHAT);
  assert.equal(grup?.activeCaseSessionId, sessionId);

  // Event atomic tersimpan pada path persistence contract.
  const eventId = "evt-telegram:update:11-CASE_SESSION_CREATED";
  const event = firestore.ambilDokumen(`case_sessions/${sessionId}/events`, eventId);
  assert.ok(event, "event CASE_SESSION_CREATED harus tersedia");
  assert.equal(event?.type, "CASE_SESSION_CREATED");

  // Kunci idempotensi tersimpan dengan format telegram:update:{updateId}.
  const kunci = firestore.ambilDokumen("idempotency_keys", "telegram:update:11");
  assert.ok(kunci);

  // Outbound sendMessage terkirim setelah commit.
  const kirim = telegram.panggilan.find((p) => p.metode === "sendMessage");
  assert.ok(kirim);
  assert.equal(kirim?.payload.chat_id, CHAT);
  assert.match(String(kirim?.payload.text), /Sesi kasus baru dibuat/);
});

test("/newcase ditolak ketika active session masih non-terminal", async () => {
  const { komposisi } = buatKomposisiUji({ [KUNCI_ADMIN]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const pertama = await prosesPerintah(komposisi, 21, "/newcase");
  assert.equal(pertama.status, "berhasil");

  const kedua = await prosesPerintah(komposisi, 22, "/newcase");
  assert.equal(kedua.status, "gagal");
  if (kedua.status === "gagal") {
    assert.match(kedua.error.message, /Sudah ada sesi aktif/);
  }
});

test("/newcase concurrent A+B: hanya satu sesi aktif yang tercipta", async () => {
  const { firestore, komposisi } = buatKomposisiUji({ [KUNCI_ADMIN]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const [a, b] = await Promise.all([
    prosesPerintah(komposisi, 31, "/newcase", CHAT, 42),
    prosesPerintah(komposisi, 32, "/newcase", CHAT, 43),
  ]);

  const sukses = [a, b].filter((h) => h.status === "berhasil");
  const gagal = [a, b].filter((h) => h.status === "gagal");

  assert.equal(sukses.length, 1, "hanya satu /newcase yang menang");
  assert.equal(gagal.length, 1, "satunya ditolak");
  assert.equal(firestore.jumlahDokumen("case_sessions"), 1, "tepat satu active CaseSession");

  const grup = firestore.ambilDokumen("groups", CHAT);
  const events = firestore.semuaDokumen("case_sessions/-1001:CASE-001:31/events");
  const sesiAktifId = String((sukses[0] as { data: { session?: { sessionId: unknown } } }).data.session?.sessionId);
  assert.equal(grup?.activeCaseSessionId, sesiAktifId);
  assert.equal(events.length, 1, "satu event CASE_SESSION_CREATED");
});

test("/newcase duplicate update yang sama → safe replay tanpa mutasi kedua", async () => {
  const { firestore, komposisi } = buatKomposisiUji({ [KUNCI_ADMIN]: "member" });
  await seedVersiKasusTerbitan(komposisi);

  const pertama = await prosesPerintah(komposisi, 41, "/newcase");
  assert.equal(pertama.status, "berhasil");

  // Telegram retry mengirim update yang sama.
  const ulang = await prosesPerintah(komposisi, 41, "/newcase");
  assert.equal(ulang.status, "berhasil", "duplicate harus safe replay (sukses), bukan error");
  if (ulang.status === "berhasil") {
    assert.match(ulang.data.message, /sudah diproses/);
  }

  assert.equal(firestore.jumlahDokumen("case_sessions"), 1);
  assert.equal(firestore.jumlahDokumen(`case_sessions/-1001:CASE-001:41/events`), 1, "duplicate tidak membuat event kedua");
});

test("/newcase tanpa CaseVersion published ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [KUNCI_ADMIN]: "member" });
  const hasil = await prosesPerintah(komposisi, 51, "/newcase");
  assert.equal(hasil.status, "gagal");
  if (hasil.status === "gagal") {
    assert.match(hasil.error.message, /published/);
  }
});