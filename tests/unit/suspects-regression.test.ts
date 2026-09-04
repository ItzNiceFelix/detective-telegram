import test from "node:test";
import assert from "node:assert/strict";

import { KomandoTelegramLayanan } from "../../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdSesiKasus, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import type { IdSesiKasus } from "../../src/fondasi/primitif.js";
import type { CaseBible } from "../../src/kasus/case-bible.js";

/**
 * M0 REGRESSION — /suspects no-op root cause:
 * sesi produksi punya caseId AI (bukan CASE-001 golden). Resolver lama
 * `case-bible:{caseId}:golden` tidak menemukan bible → gagal tanpa pesan.
 * Fix: resolve via VersiKasus.caseBibleRef.
 */
const bibleAi: CaseBible = {
  caseBibleRef: "case-bible:CASE-2026-001:v1.0",
  caseId: buatIdKasus("CASE-2026-001"),
  title: "The Gilded Alibi",
  victim: "V",
  culpritSuspectId: "S1",
  scenes: [{ sceneId: "SCENE_01", name: "Hall" }],
  objects: [{ objectId: "OBJ_1", sceneId: "SCENE_01", name: "Vase", modeDiscovery: "AUTO" }],
  observations: [{ observationId: "O1", objectId: "OBJ_1", text: "x" }],
  evidence: [{ evidenceId: "E1", objectId: "OBJ_1", truthStatus: "TRUE", relevance: "DIRECT" }],
  suspects: [{ suspectId: "S1", name: "Nona X", relationship: "r", occupation: "o", publicProfile: "p" }],
  statements: [],
  dialogueNodes: [],
  timelineEvents: [],
  causalRelations: [],
  proofNodes: [],
  proofEdges: [],
  contradictionDefinitions: [],
  motiveId: "M",
  methodId: "M",
};

const versiAi = buatVersiKasus({
  caseId: buatIdKasus("CASE-2026-001"),
  versionId: buatIdVersiKasus("v1.0"),
  schemaVersion: 1,
  metadata: { title: "The Gilded Alibi", premise: "p", genre: "MYSTERY", tags: [], starRating: 4 },
  caseBibleRef: "case-bible:CASE-2026-001:v1.0",
  assetManifestRef: "assets:CASE-2026-001:v1.0:manifest",
  contentSummary: "Generated case: test",
  status: StatusVersiKasus.PUBLISHED,
  publishedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
});

function buatLayanan() {
  const terkirim: string[] = [];
  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async (caseId, versionId) =>
        String(caseId) === "CASE-2026-001" && String(versionId) === "v1.0" ? versiAi : null,
      ambilVersiKasusTerbitan: async () => versiAi,
      simpanVersiKasus: async (v) => v,
    },
    repositoriSesiKasus: {
      ambil: async (sessionId) =>
        String(sessionId) === "-1001:CASE-2026-001:s1"
          ? {
            sessionId: buatIdSesiKasus("-1001:CASE-2026-001:s1"),
            caseId: buatIdKasus("CASE-2026-001"),
            caseVersionId: buatIdVersiKasus("v1.0"),
            groupId: buatIdGrup("-1001"),
            status: StatusSesi.OPEN,
            outcome: null,
            playerIds: [buatIdPemain("42")],
            discoveredEvidenceIds: [],
            examinedObjectIds: [],
            unlockedDialogueIds: [],
            teamTheory: null,
            score: 0,
            updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
            unlockedStatementIds: [],
            discoveredContradictionIds: [],
            knownTimelineEventIds: [],
          }
          : null,
      simpan: async (s) => s,
      transaksi: async (r) => r({ id: "tx" } as never),
    },
    repositoriGrup: {
      ambil: async (groupId) => ({
        groupId: groupId ?? buatIdGrup("-1001"),
        telegramChatId: "-1001",
        createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE" as const,
        activeCaseSessionId: buatIdSesiKasus("-1001:CASE-2026-001:s1"),
      }),
      simpan: async (g) => g,
    },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: { ambilKunci: async () => null, simpanKunci: async () => undefined },
    waktu: { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") },
    kirimPesanTelegram: async (_chat, pesan) => { terkirim.push(pesan); },
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
    repositoriCaseBible: { ambilCaseBible: async (ref) => (ref === "case-bible:CASE-2026-001:v1.0" ? bibleAi : null) },
  });
  return { layanan, terkirim };
}

test("/suspects sesi caseId AI resolve via VersiKasus.caseBibleRef (bukan no-op)", async () => {
  const { layanan, terkirim } = buatLayanan();
  const parser = new TelegramAdapter();
  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 900,
      message: { message_id: 1, text: "/suspects", chat: { id: -1001, type: "group" }, from: { id: 42, username: "u" } },
    }),
  );
  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /Nona X/);
  assert.ok(terkirim.some((p) => p.includes("Nona X")), "pesan suspects harus terkirim ke chat");
});

test("/suspects tanpa bible sama sekali → pesan error terkirim (tidak sunyi)", async () => {
  const { layanan, terkirim } = buatLayanan();
  (layanan as unknown as { konfigurasi: { repositoriCaseBible: { ambilCaseBible: () => Promise<null> } } }).konfigurasi.repositoriCaseBible.ambilCaseBible = async () => null;
  const parser = new TelegramAdapter();
  const hasil = await layanan.prosesUpdate(
    parser.parseUpdate({
      update_id: 901,
      message: { message_id: 2, text: "/suspects", chat: { id: -1001, type: "group" }, from: { id: 42, username: "u" } },
    }),
  );
  assert.equal(hasil.status, "gagal");
  assert.ok(terkirim.some((p) => /Case Bible tidak ditemukan/i.test(p)), "error harus terkirim ke chat, bukan no-op");
});
