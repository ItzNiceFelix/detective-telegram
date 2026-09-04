import test from "node:test";
import assert from "node:assert/strict";

import { KomandoTelegramLayanan } from "../../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import type { CaseBible } from "../../src/kasus/case-bible.js";
import type { KandidatKasus } from "../../src/kasus/generasi-kasus.js";
import type { ManifestAsetVisual } from "../../src/ai/visual-pipeline.js";

const CASE_GEN = "case-gen-1";
const VER_GEN = "v-gen-1";

const caseBible: CaseBible = {
  caseBibleRef: "bible-1",
  caseId: buatIdKasus(CASE_GEN),
  title: "Case Test",
  victim: "V",
  culpritSuspectId: "S1",
  scenes: [{ sceneId: "SCENE_A", name: "Scene A" }],
  objects: [{ objectId: "OBJ_1", sceneId: "SCENE_A", name: "Glass", modeDiscovery: "AUTO", evidenceId: "E1" }],
  observations: [{ observationId: "O1", objectId: "OBJ_1", text: "x" }],
  evidence: [{ evidenceId: "E1", objectId: "OBJ_1", truthStatus: "TRUE", relevance: "DIRECT" }],
  suspects: [{ suspectId: "S1", name: "A", relationship: "x", occupation: "y", publicProfile: "z" }],
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

const kandidat: KandidatKasus = {
  caseId: CASE_GEN,
  versionId: VER_GEN,
  caseBibleRef: "bible-1",
  assetManifestRef: "manifest-1",
  metadata: { title: "Case Test", premise: "p", genre: "MYSTERY", starRating: 3, tags: [] },
  caseBible,
  generation: { generatorVersion: "v", promptVersion: "v", schemaVersion: 1, provider: "fake", generatedAt: "2026-01-01T00:00:00.000Z", validationSummary: [] },
};

function buatVersiDraft(): ReturnType<typeof buatVersiKasus> {
  return buatVersiKasus({
    caseId: buatIdKasus(CASE_GEN),
    versionId: buatIdVersiKasus(VER_GEN),
    schemaVersion: 1,
    metadata: { title: "Case Test", premise: "p", genre: "MYSTERY", tags: [], starRating: 3 },
    caseBibleRef: "bible-1",
    assetManifestRef: "manifest-1",
    contentSummary: "Generated case: test",
    status: StatusVersiKasus.DRAFT,
  });
}

const manifestValid: ManifestAsetVisual = {
  manifestId: "m-1",
  caseId: CASE_GEN,
  generatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  assets: [{ assetId: "ASSET-X", planId: "PLAN-SCENE_A", sceneId: "SCENE_A", caseId: CASE_GEN, provider: "TELEGRAM_BETA", uri: "file-1", status: "READY", format: "image/jpeg", sizeBytes: 5, requiredClues: [], forbiddenClues: [], createdAt: "2026-01-01T00:00:00.000Z", verifiedAt: "2026-01-01T00:00:00.000Z", mimeType: "image/jpeg" }],
};
const manifestKosong: ManifestAsetVisual = { manifestId: "m-2", caseId: CASE_GEN, generatedAt: "2026-01-01T00:00:00.000Z", version: 1, assets: [] };

function buatLayanan(opts: { admin?: boolean; manifest?: ManifestAsetVisual | null } = {}) {
  const admin = opts.admin ?? true;
  const manifest = opts.manifest ?? manifestValid;
  const dibuat: string[] = [];
  const dikirim: string[] = [];
  const versiDraft = buatVersiDraft();
  const tersimpan: unknown[] = [];

  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => versiDraft,
      ambilVersiKasusTerbitan: async () => versiDraft,
      simpanVersiKasus: async (v) => {
        tersimpan.push(v);
        return v;
      },
    },
    repositoriSesiKasus: {
      ambil: async () => null,
      simpan: async (sesi) => sesi,
      transaksi: async (runner) => runner({ id: "tx-1" } as any),
    },
    repositoriGrup: {
      ambil: async (groupId) => ({ groupId: groupId ?? buatIdGrup("-1001"), telegramChatId: "-1001", createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"), status: "ACTIVE" as const }),
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: { ambilKunci: async () => null, simpanKunci: async () => undefined },
    waktu: { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
    validasiAdminGrup: async () => admin,
    layananProduksiKasus: { generateCase: async () => kandidat },
    layananTugasAset: {
      buatTugasAset: async (_c, _v, plan) => {
        dibuat.push(plan.sceneId);
        return { taskId: `task-${plan.planId}` };
      },
      kirimTugasAset: async (taskId) => {
        dikirim.push(taskId);
        return { taskId, status: "WAITING_FOR_ADMIN" };
      },
      verifikasiTugasAset: async (taskId) => ({ taskId, status: "VERIFIED" }),
      tolakTugasAset: async (taskId) => ({ taskId, status: "WAITING_FOR_ADMIN" }),
    },
    repositoriAsetVisualProduksi: { ambilManifest: async () => manifest },
  });

  return { layanan, dibuat, dikirim, tersimpan };
}

const parser = new TelegramAdapter();

function updateAdmin(text: string) {
  return parser.parseUpdate({
    update_id: 500,
    message: { message_id: 1, text, chat: { id: -1001, type: "group" }, from: { id: 42, username: "admin" } },
  });
}

test("/generatecase (admin) → generate + buat & kirim AssetTask per scene", async () => {
  const { layanan, dibuat, dikirim } = buatLayanan({ admin: true });

  const hasil = await layanan.prosesUpdate(updateAdmin("/generatecase mystery"));

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), new RegExp(CASE_GEN));
  assert.ok(dibuat.includes("SCENE_A"), "harus membuat 1 AssetTask utk scene");
  assert.equal(dikirim.length, 1);
});

test("/generatecase oleh non-admin ditolak", async () => {
  const { layanan, dibuat } = buatLayanan({ admin: false });

  const hasil = await layanan.prosesUpdate(updateAdmin("/generatecase"));

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /khusus admin/i);
  assert.equal(dibuat.length, 0);
});

test("/generatecase duplicate update_id → generate tidak diulang (idempoten)", async () => {
  let panggilanGenerate = 0;
  const duplikat: string[] = [];
  class IdempotenDuplikat {
    async ambilKunci() { return null; }
    async simpanKunci() { /* simpan */ }
    async klaimKunci() {
      panggilanGenerate += 0;
      const pertama = duplikat.length === 0;
      duplikat.push("klaim");
      return { sudahAda: !pertama };
    }
  }
  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: { ambilVersiKasusTerbitan: async () => buatVersiDraft() },
    repositoriSesiKasus: { ambil: async () => null, simpan: async (s) => s, transaksi: async (r) => r({ id: "t" } as never) },
    repositoriGrup: { ambil: async (g) => ({ groupId: g ?? buatIdGrup("-1001"), telegramChatId: "-1001", createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"), status: "ACTIVE" as const }), simpan: async (g) => g },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: new IdempotenDuplikat() as never,
    waktu: { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
    validasiAdminGrup: async () => true,
    layananProduksiKasus: { generateCase: async () => { panggilanGenerate += 1; return kandidat; } },
    layananTugasAset: {
      buatTugasAset: async () => ({ taskId: "t-1" }),
      kirimTugasAset: async (t) => ({ taskId: t, status: "WAITING_FOR_ADMIN" }),
      verifikasiTugasAset: async (t) => ({ taskId: t, status: "VERIFIED" }),
      tolakTugasAset: async (t) => ({ taskId: t, status: "WAITING_FOR_ADMIN" }),
    },
    repositoriAsetVisualProduksi: { ambilManifest: async () => manifestValid },
  });

  await layanan.prosesUpdate(updateAdmin("/generatecase mystery"));
  await layanan.prosesUpdate(updateAdmin("/generatecase mystery"));

  assert.equal(panggilanGenerate, 1);
});

test("/publishcase (admin) dengan manifest valid → simpan PUBLISHED", async () => {
  const { layanan, tersimpan } = buatLayanan({ admin: true, manifest: manifestValid });

  const hasil = await layanan.prosesUpdate(updateAdmin(`/publishcase ${CASE_GEN} ${VER_GEN}`));

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /dipublish/i);
  assert.equal(tersimpan.length, 1);
  const v = tersimpan[0] as { status: string };
  assert.equal(v.status, StatusVersiKasus.PUBLISHED);
});

test("/publishcase dengan manifest kosong → ditolak, tidak menyimpan", async () => {
  const { layanan, tersimpan } = buatLayanan({ admin: true, manifest: manifestKosong });

  const hasil = await layanan.prosesUpdate(updateAdmin(`/publishcase ${CASE_GEN} ${VER_GEN}`));

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /belum lengkap/i);
  assert.equal(tersimpan.length, 0);
});

test("/verifytask (admin) memanggil verifikasi task", async () => {
  const { layanan } = buatLayanan({ admin: true });

  const hasil = await layanan.prosesUpdate(updateAdmin("/verifytask task-PLAN-SCENE_A"));

  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /VERIFIED/);
});