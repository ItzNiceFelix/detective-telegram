import test from "node:test";
import assert from "node:assert/strict";

import { RolePemain, StatusSesi } from "../../src/domain/enums.js";
import { validasiEligibilitasDetektif } from "../../src/aplikasi/otorisasi.js";
import { ValidatorAdminGrupTelegram, ValidatorAksesTelegram, ValidatorGrupTelegram } from "../../src/application/services/validasi-telegram.js";
import { KesalahanAutorisasi } from "../../src/fondasi/eror.js";
import { buatIdGrup, buatIdPemain, buatIdSesiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { buatKomposisiUji, seedVersiKasusTerbitan, buatUpdateGrup } from "./setup-komposisi.js";

const CHAT = "-1001";
const ADMIN = `${CHAT}:42`;
const SPECTATOR = `${CHAT}:77`;

test("ValidatorGrupTelegram: grup baru didaftarkan ACTIVE; DISABLED ditolak", async () => {
  const { firestore, komposisi } = buatKomposisiUji({});

  const pertama = await komposisi.validatorGrupTelegram.validasi(CHAT);
  assert.equal(pertama, true);
  assert.equal(firestore.ambilDokumen("groups", CHAT)?.status, "ACTIVE");

  // Grup DISABLED → validasi gagal.
  await komposisi.repositoriGrup.simpan({
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    status: "DISABLED",
  });
  const kedua = await komposisi.validatorGrupTelegram.validasi(CHAT);
  assert.equal(kedua, false);
});

test("pendaftaran grup tidak pernah menimpa pointer sesi aktif (create-if-missing)", async () => {
  const { komposisi } = buatKomposisiUji({});
  await seedVersiKasusTerbitan(komposisi);

  // Grup dengan pointer sesi aktif sudah ada (mis. dibuat oleh /newcase).
  await komposisi.repositoriGrup.simpan({
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    status: "ACTIVE",
    activeCaseSessionId: buatIdSesiKasus("sesi-aktif"),
  });

  await komposisi.validatorGrupTelegram.validasi(CHAT);

  const grup = await komposisi.repositoriGrup.ambil(buatIdGrup(CHAT));
  assert.equal(grup?.activeCaseSessionId, "sesi-aktif", "pointer tidak boleh tertimpa null");
});

test("ValidatorAksesTelegram: member lolos, non-member ditolak, API gagal → fail-closed", async () => {
  const { telegram, komposisi } = buatKomposisiUji({ [ADMIN]: "member" });

  assert.equal(await komposisi.validatorAksesTelegram.validasi("42", CHAT), true);
  assert.equal(await komposisi.validatorAksesTelegram.validasi("77", CHAT), false);

  telegram.gagalkanMetode("getChatMember", new Error("API down"));
  assert.equal(await komposisi.validatorAksesTelegram.validasi("99", CHAT), false, "API gagal → akses ditolak");
});

test("ValidatorAksesTelegram: hasil di-cache sehingga lookup Telegram tidak berulang", async () => {
  const { telegram, komposisi } = buatKomposisiUji({ [ADMIN]: "member" });

  await komposisi.validatorAksesTelegram.validasi("42", CHAT);
  await komposisi.validatorAksesTelegram.validasi("42", CHAT);
  await komposisi.validatorAksesTelegram.validasi("42", CHAT);

  const jumlahLookup = telegram.panggilan.filter((p) => p.metode === "getChatMember").length;
  assert.equal(jumlahLookup, 1, "cache mencegah panggilan Telegram berulang");
});

test("ValidatorAdminGrupTelegram: creator/administrator lolos, member biasa tidak", async () => {
  const { komposisi } = buatKomposisiUji({
    [ADMIN]: "administrator",
    [`${CHAT}:43`]: "member",
    [`${CHAT}:44`]: "creator",
  });

  assert.equal(await komposisi.validatorAdminGrupTelegram.validasi("42", CHAT), true);
  assert.equal(await komposisi.validatorAdminGrupTelegram.validasi("44", CHAT), true);
  assert.equal(await komposisi.validatorAdminGrupTelegram.validasi("43", CHAT), false);
});

test("validasiEligibilitasDetektif: spectator dan non-player ditolak untuk mutasi", () => {
  const sesi = {
    sessionId: buatIdSesiKasus("sesi-1"),
    caseId: buatIdGrup("CASE-001"),
    caseVersionId: "V1",
    groupId: buatIdGrup(CHAT),
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("42")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-02-01T00:00:00.000Z"),
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
  } as never;

  // Player aktif pada sesi OPEN → diizinkan.
  assert.doesNotThrow(() => validasiEligibilitasDetektif(sesi, buatIdPemain("42")));

  // Spectator → ditolak.
  assert.throws(() => validasiEligibilitasDetektif(sesi, buatIdPemain("42"), RolePemain.SPECTATOR), KesalahanAutorisasi);

  // User di luar playerIds (spectator efektif) → ditolak.
  assert.throws(() => validasiEligibilitasDetektif(sesi, buatIdPemain("77")), KesalahanAutorisasi);
});

test("wrong context: mutasi pada chat private ditolak", async () => {
  const { komposisi } = buatKomposisiUji({ [ADMIN]: "administrator" });
  await seedVersiKasusTerbitan(komposisi);

  const hasil = await komposisi.layananKomando.prosesUpdate({
    updateId: "900",
    userId: "42",
    chatId: "42",
    chatType: "private",
    text: "/newcase",
    command: "/newcase",
    payload: {},
  } as never);

  assert.equal(hasil.status, "gagal");
  if (hasil.status === "gagal") {
    assert.match(hasil.error.message, /group/);
  }
});