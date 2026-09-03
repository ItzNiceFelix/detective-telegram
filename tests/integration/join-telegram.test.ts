import test from "node:test";
import assert from "node:assert/strict";

import { buatKomposisiUji, seedVersiKasusTerbitan, prosesPerintah, type KomposisiUji } from "./setup-komposisi.js";
import type { SesiKasus, Grup } from "../../src/domain/entities.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdGrup, buatIdPemain, buatIdSesiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";

const CHAT = "-1001";
const SESSION = "session-1";
const WAKTU = buatWaktuIso("2026-02-01T00:00:00.000Z");

function sesiDasar(over: Partial<SesiKasus> = {}): SesiKasus {
  return {
    sessionId: buatIdSesiKasus(SESSION),
    caseId: "CASE-001" as never,
    caseVersionId: "V1" as never,
    groupId: buatIdGrup(CHAT),
    status: StatusSesi.LOBBY,
    outcome: null,
    playerIds: [buatIdPemain("42")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: WAKTU,
    ...over,
  };
}

async function siapkanSesi(komposisi: KomposisiUji["komposisi"], sesi: SesiKasus): Promise<void> {
  const grup: Grup = {
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: WAKTU,
    status: "ACTIVE",
    activeCaseSessionId: sesi.sessionId,
  };
  await komposisi.repositoriGrup.simpan(grup);
  await komposisi.repositoriSesiKasus.simpan(sesi);
}

/** Ambil dokumen sesi dari fake Firestore untuk inspeksi state. */
async function ambilSesi(komposisi: KomposisiUji["komposisi"]): Promise<SesiKasus | null> {
  return komposisi.repositoriSesiKasus.ambil(buatIdSesiKasus(SESSION));
}

test("/join normal — spectator di LOBBY menjadi Detective aktif", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 201, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  const pesan = hasil.data!.message;
  assert.ok(pesan.includes("bergabung"), `pesan: ${pesan}`);

  const sesi = await ambilSesi(komposisi);
  assert.ok(sesi!.playerIds.includes(buatIdPemain("7")));
  assert.equal(sesi!.playerIds.length, 2);
});

test("/join duplicate — idempotent, tidak menambah participant & tidak duplikasi player", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 202, "/join", CHAT, 42);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("sudah menjadi Detective"), hasil.data!.message);

  const sesi = await ambilSesi(komposisi);
  assert.equal(sesi!.playerIds.length, 1);
  assert.deepEqual(sesi!.playerIds, [buatIdPemain("42")]);
});

test("/join full — 7th detective ditolak, count tidak melebihi 6", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ playerIds: ["1", "2", "3", "4", "5", "6"].map((x) => buatIdPemain(x)) }));

  const hasil = await prosesPerintah(komposisi, 203, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("batas maksimum"), hasil.data!.message);

  const sesi = await ambilSesi(komposisi);
  assert.equal(sesi!.playerIds.length, 6);
  assert.ok(!sesi!.playerIds.includes(buatIdPemain("7")));
});

test("/join concurrent — dua user join slot terakhir; tepat SATU diterima, SATU ditolak", async () => {
  const MEMBER = { [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" };
  const { komposisi } = buatKomposisiUji(MEMBER);
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ playerIds: ["1", "2", "3", "4", "5"].map((x) => buatIdPemain(x)) }));

  const [a, b] = await Promise.all([
    prosesPerintah(komposisi, 204, "/join", CHAT, 42),
    prosesPerintah(komposisi, 205, "/join", CHAT, 7),
  ]);

  const pesanA = (assert.equal(a.status, "berhasil"), a.data.message);
  const pesanB = (assert.equal(b.status, "berhasil"), b.data.message);
  const diterima = [pesanA, pesanB].filter((p) => p.includes("bergabung"));
  const ditolak = [pesanA, pesanB].filter((p) => p.includes("batas maksimum"));
  assert.equal(diterima.length, 1, `harus tepat satu diterima: ${pesanA} | ${pesanB}`);
  assert.equal(ditolak.length, 1, `harus tepat satu ditolak: ${pesanA} | ${pesanB}`);

  const sesi = await ambilSesi(komposisi);
  assert.equal(sesi!.playerIds.length, 6, "participant count tidak boleh > 6");
  const unik = new Set(sesi!.playerIds.map(String));
  assert.equal(unik.size, 6, "tidak boleh ada duplicate player id");
});

test("/join wrong group — user bukan member grup ditolak (authorization)", async () => {
  // statusAnggota default "left" → validasiAksesTelegram mengembalikan false.
  const { komposisi } = buatKomposisiUji({});
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar());

  const hasil = await prosesPerintah(komposisi, 206, "/join", CHAT, 999);
  assert.equal(hasil.status, "gagal");
  assert.equal(hasil.error!.name, "KesalahanAutorisasi");

  const sesi = await ambilSesi(komposisi);
  assert.ok(!sesi!.playerIds.includes(buatIdPemain("999")));
});
test("/join no active session — tidak ada sesi aktif", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  // Grup terdaftar ACTIVE tanpa activeCaseSessionId.
  await komposisi.repositoriGrup.simpan({
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: WAKTU,
    status: "ACTIVE",
  });

  const hasil = await prosesPerintah(komposisi, 207, "/join", CHAT, 42);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("Tidak ada sesi aktif"), hasil.data!.message);
});

test("/join paused session — ditolak sesuai contract", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ status: StatusSesi.PAUSED, playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 208, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("dijeda"), hasil.data!.message);
});

test("/join OPEN session — ditolak (lobby ditutup, spectator tidak join mid-session)", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ status: StatusSesi.OPEN, playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 209, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("sudah dimulai"), hasil.data!.message);
});

test("/join cleared session — ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ status: StatusSesi.CLEARED, playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 210, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("selesai"), hasil.data!.message);
});

test("/join archived session — ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ status: StatusSesi.ARCHIVED, playerIds: [buatIdPemain("42")] }));

  const hasil = await prosesPerintah(komposisi, 211, "/join", CHAT, 7);
  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.data!.message.includes("diarsipkan"), hasil.data!.message);
});

test("/join duplicate Telegram update — safe replay tanpa mutasi kedua", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await seedVersiKasusTerbitan(komposisi);
  await siapkanSesi(komposisi, sesiDasar({ playerIds: [buatIdPemain("42")] }));

  // update_id SAMA di-deliver dua kali.
  const pertama = await prosesPerintah(komposisi, 212, "/join", CHAT, 7);
  const kedua = await prosesPerintah(komposisi, 212, "/join", CHAT, 7);

  assert.equal(pertama.status, "berhasil");
  assert.ok(pertama.data!.message.includes("bergabung"), pertama.data!.message);
  assert.equal(kedua.status, "berhasil");
  assert.ok(kedua.data!.message.includes("sudah diproses"), kedua.data!.message);

  const sesi = await ambilSesi(komposisi);
  assert.equal(sesi!.playerIds.length, 2, "hanya satu join yang efektif");
  const unik = new Set(sesi!.playerIds.map(String));
  assert.equal(unik.size, 2);
});