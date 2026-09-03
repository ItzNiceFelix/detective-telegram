import test from "node:test";
import assert from "node:assert/strict";

import { LayananProduksiKasus, type RepositoriVersiProduksi } from "../../src/application/services/layanan-produksi-kasus.js";
import { FakeAiProvider } from "../../src/ai/fake-provider.js";
import { PenyediaGambarPalsu, RepositoriAsetVisualMemori } from "../../src/ai/visual-pipeline.js";
import type { KontrakPenyediaGambar, KontrakRepositoriAsetVisual, VisualPlan } from "../../src/ai/visual-pipeline.js";
import type { PintuAi } from "../../src/ai/contracts.js";
import { KesalahanProviderAi } from "../../src/ai/errors.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { StatusVersiKasus, type VersiKasus } from "../../src/kasus/versi-kasus.js";
import type { BenihKasus } from "../../src/kasus/generasi-kasus.js";

// ===== Fixture valid (mirip ai-case-generation.test.ts) =====

function buatCaseBibleValid(): any {
  return {
    caseBibleRef: "case-bible:CASE-900:main",
    caseId: "CASE-900",
    title: "The Locked Ward",
    victim: "Evelyn Cross",
    culpritSuspectId: "S01",
    scenes: [{ sceneId: "SCENE_01", name: "Ward" }, { sceneId: "SCENE_02", name: "Corridor" }],
    objects: [
      { objectId: "OBJ_01", sceneId: "SCENE_01", name: "Glass shard", modeDiscovery: "AUTO", evidenceId: "E01" },
      { objectId: "OBJ_02", sceneId: "SCENE_01", name: "Medicine cabinet", modeDiscovery: "AUTO", evidenceId: "E02" },
    ],
    observations: [
      { observationId: "OBS_01", objectId: "OBJ_01", text: "A shattered glass lies by the bed." },
      { observationId: "OBS_02", objectId: "OBJ_02", text: "The cabinet is open." },
    ],
    evidence: [
      { evidenceId: "E01", objectId: "OBJ_01", source: "FORENSIC", truthStatus: "TRUE", relevance: "DIRECT", relatedSuspects: ["S01"], relatedTimelineEvents: ["T01"] },
      { evidenceId: "E02", objectId: "OBJ_02", source: "ENVIRONMENT", truthStatus: "TRUE", relevance: "SUPPORTING", relatedSuspects: ["S02"], relatedTimelineEvents: ["T02"] },
    ],
    suspects: [
      { suspectId: "S01", name: "Mira Holt", relationship: "former nurse", occupation: "Nurse", publicProfile: "kept secrets" },
      { suspectId: "S02", name: "Owen Dale", relationship: "colleague", occupation: "Doctor", publicProfile: "shared history" },
    ],
    statements: [
      { statementId: "ST01", suspectId: "S01", text: "I never left the ward.", claim: { subject: "Mira", predicate: "was in", value: "the ward" } },
    ],
    dialogueNodes: [
      { nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "I never left the ward." }, unlocksStatementId: "ST01" },
    ],
    timelineEvents: [
      { eventId: "T01", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_01", actorIds: ["S01"], action: "Mira enters the ward", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: ["ST01"] },
      { eventId: "T02", timestamp: { precision: "EXACT", start: "21:30" }, locationId: "SCENE_01", actorIds: ["S02"], action: "Owen checks cabinet", truthStatus: "TRUE", relatedEvidenceIds: ["E02"], relatedStatementIds: [] },
    ],
    causalRelations: [
      { dari: "E01", ke: "T01", jenis: "REQUIRES" },
      { dari: "T01", ke: "SOL_01", jenis: "CAUSES" },
      { dari: "E02", ke: "SOL_01", jenis: "CAUSES" as any },
    ],
    proofNodes: [
      { nodeId: "E01", kind: "EVIDENCE" },
      { nodeId: "T01", kind: "EVENT" },
      { nodeId: "SOL_01", kind: "SOLUTION_FACT" },
    ],
    proofEdges: [
      { dari: "E01", ke: "T01", relasi: "SUPPORTS", wajib: true },
      { dari: "T01", ke: "SOL_01", relasi: "ESTABLISHES", wajib: true },
    ],
    contradictionDefinitions: [
      { contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01", unlocksNodeId: "D01" },
    ],
  };
}

function buatResponValidCandidate(): any {
  return {
    caseId: "CASE-900",
    versionId: "v-900",
    title: "The Locked Ward",
    premise: "A nurse took the ward key and hid a weapon beneath the cabinet.",
    genre: "MYSTERY",
    tags: ["mystery", "ward"],
    caseBible: buatCaseBibleValid(),
  };
}

class RepositoriVersiUji implements RepositoriVersiProduksi {
  tersimpan: VersiKasus[] = [];

  async simpanVersiKasus(versi: VersiKasus): Promise<VersiKasus> {
    this.tersimpan.push(versi);
    return versi;
  }
}

interface OpsiLayananUji {
  enabled?: boolean;
  teks?: PintuAi;
  gambar?: KontrakPenyediaGambar;
  aset?: KontrakRepositoriAsetVisual;
  maxRetries?: number;
}

function buatLayanan(opsi: OpsiLayananUji = {}) {
  const repositoriVersi = new RepositoriVersiUji();
  const repositoriAset = opsi.aset ?? new RepositoriAsetVisualMemori();
  const layanan = new LayananProduksiKasus({
    konfigurasi: {
      caseGenerationEnabled: opsi.enabled ?? true,
      penyediaTeks: opsi.teks,
      penyediaGambar: opsi.gambar,
      providerName: "fake-ai",
      opsiGenerasi: { maxRetries: opsi.maxRetries ?? 0 },
    },
    repositoriVersi,
    repositoriAset,
  });
  return { layanan, repositoriVersi, repositoriAset };
}

const seedUji: BenihKasus = {
  genre: "MYSTERY",
  setting: "hospital",
  difficulty: "DETECTIVE",
  suspectCount: 2,
  sceneCount: 1,
  mustUseMechanics: ["timeline_contradiction"],
};

const planUji: VisualPlan = {
  planId: "PLAN-01",
  sceneId: "SCENE_01",
  purpose: "CRIME_SCENE",
  requiredClues: [{ id: "CLUE-01", label: "Glass shard", entityId: "E01", kind: "evidence" }],
  forbiddenClues: [],
  inspectableObjects: ["Medicine cabinet"],
};

const keluaranGambarValid = JSON.stringify({
  uri: "https://cdn.ujian.test/PLAN-01.png",
  status: "READY",
  format: "image/png",
  sizeBytes: 150000,
  requiredClues: ["CLUE-01"],
  forbiddenClues: [],
  verifyNotes: ["clue terverifikasi via metadata"],
});
test("generateCase: DISABLED bila caseGenerationEnabled=false", async () => {
  const { layanan } = buatLayanan({ enabled: false, teks: new FakeAiProvider([]) });
  await assert.rejects(
    () => layanan.generateCase(seedUji),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "DISABLED");
      return true;
    },
  );
});

test("generateCase: PROVIDER_UNAVAILABLE bila text provider tidak ada", async () => {
  const { layanan } = buatLayanan({ enabled: true });
  await assert.rejects(
    () => layanan.generateCase(seedUji),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "PROVIDER_UNAVAILABLE");
      return true;
    },
  );
});

test("generateCase: kandidat valid → versi DRAFT immutable tersimpan (menunggu publish aset)", async () => {
  const { layanan, repositoriVersi } = buatLayanan({ teks: new FakeAiProvider([JSON.stringify(buatResponValidCandidate())]) });

  const kandidat = await layanan.generateCase(seedUji);
  assert.equal(kandidat.caseId, "CASE-900");
  assert.ok(kandidat.versionId);

  assert.equal(repositoriVersi.tersimpan.length, 1);
  const versi = repositoriVersi.tersimpan[0];
  assert.ok(versi);
  // Part C production flow: generateCase TIDAK langsung publish. Kandidat
  // disimpan DRAFT menunggu asset gambar durable; publish via admin publishCase.
  assert.equal(versi.status, StatusVersiKasus.DRAFT);
  assert.equal(Object.isFrozen(versi), true);
  assert.ok(String(versi.caseId).includes("CASE-900"));
  assert.equal(versi.publishedAt, undefined);
});

test("generateCase: output tidak valid → ditolak, TIDAK ada versi tersimpan", async () => {
  const { layanan, repositoriVersi } = buatLayanan({ teks: new FakeAiProvider(["{bukan json valid"]), maxRetries: 0 });

  await assert.rejects(() => layanan.generateCase(seedUji));
  assert.equal(repositoriVersi.tersimpan.length, 0);
});

test("generateImages: PROVIDER_UNAVAILABLE bila image provider tidak ada", async () => {
  const { layanan } = buatLayanan({});
  await assert.rejects(
    () => layanan.generateImages("CASE-X", [planUji]),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "PROVIDER_UNAVAILABLE");
      return true;
    },
  );
});

test("generateImages: caseId kosong → KesalahanValidasi", async () => {
  const { layanan } = buatLayanan({ gambar: new PenyediaGambarPalsu([]) });
  await assert.rejects(
    () => layanan.generateImages("", [planUji]),
    (err: unknown) => err instanceof KesalahanValidasi,
  );
});

test("generateImages: aset valid + manifest; pemanggilan kedua di-dedup (provider tidak dipanggil ulang)", async () => {
  const gambar = new PenyediaGambarPalsu([keluaranGambarValid]);
  const { layanan, repositoriAset } = buatLayanan({ gambar });

  const manifest1 = await layanan.generateImages("CASE-IMG", [planUji]);
  assert.equal(gambar.calls.length, 1);
  assert.equal(manifest1.caseId, "CASE-IMG");
  assert.equal(manifest1.assets.length, 1);
  const aset1 = manifest1.assets[0];
  assert.ok(aset1);
  assert.equal(aset1.assetId, "ASSET-PLAN-01");
  assert.equal(aset1.status, "READY");
  assert.equal(aset1.uri, "https://cdn.ujian.test/PLAN-01.png");

  const manifest2 = await layanan.generateImages("CASE-IMG", [planUji]);
  assert.equal(gambar.calls.length, 1); // dedup → tidak ada generate ulang
  assert.equal(manifest2.assets.length, 1);
  assert.equal(manifest2.assets[0]?.assetId, aset1.assetId);

  const kunci = repositoriAset.ambilKunci(planUji, "CASE-IMG");
  assert.equal(kunci, "CASE-IMG:SCENE_01:PLAN-01");
  const tersimpan = await repositoriAset.ambil(kunci);
  assert.ok(tersimpan);
  assert.equal(tersimpan.assetId, aset1.assetId);
});