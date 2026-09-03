import test from "node:test";
import assert from "node:assert/strict";

import { buatKomposisiUji, seedVersiKasusTerbitan, prosesPerintah } from "./setup-komposisi.js";
import type { SesiKasus, Grup } from "../../src/domain/entities.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdGrup, buatIdPemain, buatIdSesiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";

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

// KOMANDO_MUTASI_GAMEPLAY yang diwajibkan BLOCKER 3.
const KOMANDO = [
  { cmd: "/join", args: "" },
  { cmd: "/investigate", args: "SCENE_304" },
  { cmd: "/inspect", args: "OBJ_WATCH" },
  { cmd: "/interrogate", args: "SUSPECT_MARCUS" },
  { cmd: "/confront", args: "SUSPECT_MARCUS E01" },
  { cmd: "/theory", args: "SUSPECT_MARCUS" },
  { cmd: "/accuse", args: "SUSPECT_MARCUS" },
  { cmd: "/vote", args: "" },
  { cmd: "/finalize", args: "" },
];

test("BLOCKER 3 — non-member DITOLAK untuk SEMUA command mutasi gameplay; tidak ada mutasi", async () => {
  const { komposisi } = buatKomposisiUji({}); // 999 non-member (status default "left")
  await siapkan(komposisi);

  let updateId = 400;
  for (const { cmd, args } of KOMANDO) {
    const hasil = await prosesPerintah(komposisi, updateId++, `${cmd}${args ? " " + args : ""}`, CHAT, 999);
    assert.equal(hasil.status, "gagal", `${cmd} harus gagal untuk non-member`);
    assert.equal(hasil.error!.name, "KesalahanAutorisasi", `${cmd} harus KesalahanAutorisasi`);
  }

  const sesi = await ambilSesi(komposisi);
  assert.deepEqual(sesi!.playerIds, [buatIdPemain("42")]);
  assert.deepEqual(sesi!.discoveredEvidenceIds, []);
  assert.equal(sesi!.score, 0);
});

test("BLOCKER 3 — spectator (member tapi bukan detective) TIDAK dapat melakukan mutasi gameplay", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member", [`${CHAT}:7`]: "member" });
  await siapkan(komposisi);

  // 7 adalah member grup tapi BUKAN detective aktif (tidak di playerIds).
  const hasil = await prosesPerintah(komposisi, 410, "/investigate SCENE_304", CHAT, 7);
  assert.equal(hasil.status, "gagal");
  assert.equal(hasil.error!.name, "KesalahanAutorisasi");

  const sesi = await ambilSesi(komposisi);
  assert.deepEqual(sesi!.playerIds, [buatIdPemain("42")]);
  assert.deepEqual(sesi!.discoveredEvidenceIds, []);
});

test("BLOCKER 3 — detective aktif dan member diizinkan melakukan mutasi yang sah", async () => {
  const { komposisi } = buatKomposisiUji({ [`${CHAT}:42`]: "member" });
  await siapkan(komposisi);

  // Detektif 42 memeriksa objek — mutasi sah, bukan grosir perkenan untuk non-detective.
  const hasil = await prosesPerintah(komposisi, 411, "/inspect OBJ_WATCH", CHAT, 42);
  assert.equal(hasil.status, "berhasil");

  const sesi = await ambilSesi(komposisi);
  assert.ok(sesi!.examinedObjectIds.includes("OBJ_WATCH"));
  assert.deepEqual(sesi!.playerIds, [buatIdPemain("42")]);
});