import test from "node:test";
import assert from "node:assert/strict";

import { KomandoTelegramLayanan } from "../../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";

const versiDiterbitkan = buatVersiKasus({
  caseId: buatIdKasus("case-001"),
  versionId: buatIdVersiKasus("v-1"),
  schemaVersion: 1,
  metadata: {
    title: "Kasus Hotel",
    premise: "Direktur hotel ditemukan tewas.",
    genre: "MISTERI",
    tags: ["hotel", "misteri"],
    starRating: 4,
  },
  caseBibleRef: "case-bible:case-001:main",
  assetManifestRef: "assets:case-001:v-1:manifest",
  contentSummary: "Versi final diterbitkan.",
  status: StatusVersiKasus.PUBLISHED,
  publishedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
});

function buatLayanan() {
  const storedSessions: Record<string, any> = {};
  const activeSessionByGroup: Record<string, string> = {};
  const eventLog: Array<{ type: string; sessionId?: string }> = [];

  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => versiDiterbitkan,
    },
    repositoriSesiKasus: {
      ambil: async (sessionId) => storedSessions[String(sessionId)] ?? null,
      simpan: async (sesi) => {
        storedSessions[String(sesi.sessionId)] = sesi;
        activeSessionByGroup[String(sesi.groupId)] = String(sesi.sessionId);
        return sesi;
      },
      transaksi: async (runner) => runner({ id: "tx-1" } as any),
    },
    repositoriGrup: {
      ambil: async (groupId) => ({
        groupId: groupId ?? buatIdGrup("group-1"),
        telegramChatId: "-1001",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "ACTIVE",
        activeCaseSessionId: activeSessionByGroup[String(groupId)] as any,
      }),
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: {
      kirim: async (event) => {
        eventLog.push({ type: String(event.type), sessionId: String(event.sessionId ?? "") });
      },
    },
    kontrakIdempoten: {
      ambilKunci: async () => null,
      simpanKunci: async () => undefined,
    },
    waktu: {
      sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z"),
    },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
  });

  return { layanan, storedSessions, eventLog, activeSessionByGroup };
}

test("/newcase normal membuat sesi dan event", async () => {
  const { layanan, storedSessions, eventLog } = buatLayanan();
  const parser = new TelegramAdapter();

  const update = parser.parseUpdate({
    update_id: 11,
    message: {
      message_id: 1,
      text: "/newcase",
      chat: { id: -1001, type: "group" },
      from: { id: 42, username: "detektif" },
    },
  });

  const hasil = await layanan.prosesUpdate(update);

  assert.equal(hasil.status, "berhasil");
  assert.equal(hasil.data.command, "/newcase");
  assert.equal(Object.keys(storedSessions).length, 1);
  assert.equal(eventLog[0]?.type, "CASE_SESSION_CREATED");
});

test("/newcase menolak saat active session sudah ada", async () => {
  const { layanan, storedSessions, activeSessionByGroup } = buatLayanan();
  const parser = new TelegramAdapter();

  const existing = {
    sessionId: "-1001:case-001:existing" as any,
    caseId: buatIdKasus("case-001"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("-1001"),
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  storedSessions["-1001:case-001:existing"] = existing;
  activeSessionByGroup["-1001"] = "-1001:case-001:existing";

  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 12,
      message: {
        message_id: 2,
        text: "/newcase",
        chat: { id: -1001, type: "group" },
        from: { id: 42, username: "detektif" },
      },
    }),
  );

  assert.equal(hasil.status, "gagal");
});

test("/startcase memulai sesi yang ada di LOBBY", async () => {
  const { layanan, storedSessions, activeSessionByGroup } = buatLayanan();
  const parser = new TelegramAdapter();

  storedSessions["-1001:case-001:session-1"] = {
    sessionId: "-1001:case-001:session-1" as any,
    caseId: buatIdKasus("case-001"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("-1001"),
    status: StatusSesi.LOBBY,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  activeSessionByGroup["-1001"] = "-1001:case-001:session-1";

  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 13,
      message: {
        message_id: 3,
        text: "/startcase",
        chat: { id: -1001, type: "group" },
        from: { id: 42, username: "detektif" },
      },
    }),
  );

  assert.equal(hasil.status, "berhasil");
  assert.ok(hasil.status === "berhasil" && hasil.data.session);
  assert.equal(hasil.data.session.status, StatusSesi.OPEN);
});

test("/status menampilkan status aktif tanpa mutation", async () => {
  const { layanan, storedSessions, activeSessionByGroup } = buatLayanan();
  const parser = new TelegramAdapter();

  storedSessions["-1001:case-001:session-2"] = {
    sessionId: "-1001:case-001:session-2" as any,
    caseId: buatIdKasus("case-001"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("-1001"),
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
  };
  activeSessionByGroup["-1001"] = "-1001:case-001:session-2";

  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 14,
      message: {
        message_id: 4,
        text: "/status",
        chat: { id: -1001, type: "group" },
        from: { id: 42, username: "detektif" },
      },
    }),
  );

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /OPEN|ACTIVE/i);
});

test("update Telegram yang tidak valid ditolak", async () => {
  const { layanan } = buatLayanan();
  const parser = new TelegramAdapter();

  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 15,
      message: {
        text: "hello",
        chat: { id: 999, type: "private" },
      },
    }),
  );

  assert.equal(hasil.status, "gagal");
});
