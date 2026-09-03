import test from "node:test";
import assert from "node:assert/strict";

import { buatKomposisiUji, seedVersiKasusTerbitan, prosesPerintah } from "../integration/setup-komposisi.js";
import type { SesiKasus, Grup } from "../../src/domain/entities.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdGrup, buatIdPemain, buatIdSesiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { MAKS_PANJANG_ARGUMEN, MAKS_JUMLAH_ARGUMEN } from "../../src/application/services/komando-telegram.js";

const CHAT = "-1001";
const SESSION = "session-1";
const WAKTU = buatWaktuIso("2026-02-01T00:00:00.000Z");

async function siapkan(komposisi: ReturnType<typeof buatKomposisiUji>["komposisi"]): Promise<void> {
  await seedVersiKasusTerbitan(komposisi);
  await komposisi.repositoriGrup.simpan({
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: WAKTU,
    status: "ACTIVE",
    activeCaseSessionId: buatIdSesiKasus(SESSION),
  } as Grup);
  await komposisi.repositoriSesiKasus.simpan({
    sessionId: buatIdSesiKasus(SESSION),
    caseId: "CASE-001" as never,
    caseVersionId: "V1" as never,
    groupId: buatIdGrup(CHAT),
    status: StatusSesi.OPEN,
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
  } as SesiKasus);
}

async function ambilSesi(komposisi: ReturnType<typeof buatKomposisiUji>["komposisi"]): Promise<SesiKasus | null> {
  return komposisi.repositoriSesiKasus.ambil(buatIdSesiKasus(SESSION));
}

test("BLOCKER 2 — argumen/ID terlalu panjang ditolak sebelum mutasi gameplay", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await siapkan(komposisi);

  const argPanjang = "A".repeat(MAKS_PANJANG_ARGUMEN + 1);
  const hasil = await prosesPerintah(komposisi, 301, `/inspect ${argPanjang}`, CHAT, 42);
  assert.equal(hasil.status, "gagal");
  assert.equal(hasil.error!.name, "KesalahanValidasi");
  assert.ok(hasil.error!.message.includes("panjang"), hasil.error!.message);

  // Tidak ada mutasi: scene/object tetap kosong.
  const sesi = await ambilSesi(komposisi);
  assert.deepEqual(sesi!.examinedObjectIds, []);
});

test("BLOCKER 2 — teks mentah lebih dari batas ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await siapkan(komposisi);

  // > 500 karakter keseluruhan.
  const teksPanjang = "/inspect " + "A".repeat(600);
  const hasil = await prosesPerintah(komposisi, 302, teksPanjang, CHAT, 42);
  assert.equal(hasil.status, "gagal");
  assert.equal(hasil.error!.name, "KesalahanValidasi");

  const sesi = await ambilSesi(komposisi);
  assert.deepEqual(sesi!.examinedObjectIds, []);
});

test("BLOCKER 2 — terlalu banyak argumen ditolak (bounded argument list)", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await siapkan(komposisi);

  // Melebihi MAKS_JUMLAH_ARGUMEN argumen. Masing-masing pendek, total tetap < 500.
  const banyakArg = "/theory " + Array.from({ length: MAKS_JUMLAH_ARGUMEN + 5 }, (_, i) => `x${i}`).join(" ");
  const hasil = await prosesPerintah(komposisi, 303, banyakArg, CHAT, 42);
  assert.equal(hasil.status, "gagal");
  assert.equal(hasil.error!.name, "KesalahanValidasi");
  assert.ok(hasil.error!.message.includes("Terlalu banyak argumen"), hasil.error!.message);
});