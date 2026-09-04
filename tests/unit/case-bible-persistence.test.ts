import test from "node:test";
import assert from "node:assert/strict";

import { FakeAiProvider } from "../../src/ai/fake-provider.js";
import { LayananProduksiKasus } from "../../src/application/services/layanan-produksi-kasus.js";
import { RepositoriCaseBibleGabungan } from "../../src/infrastructure/repositories/firestore/repositori-case-bible.js";
import { RepositoriCaseBibleStatis } from "../../src/kasus/case-bible-repository.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { BenihKasus } from "../../src/kasus/generasi-kasus.js";
import type { CaseBible } from "../../src/kasus/case-bible.js";
import { RepositoriAsetVisualMemori } from "../../src/ai/visual-pipeline.js";

function bibleMini(caseId: string, ref: string): CaseBible {
  return {
    caseBibleRef: ref,
    caseId: caseId as never,
    title: "Mini",
    victim: "V",
    culpritSuspectId: "S01",
    scenes: [{ sceneId: "SCENE_01", name: "Hall" }],
    objects: [{ objectId: "OBJ_01", sceneId: "SCENE_01", name: "Vas", modeDiscovery: "AUTO", evidenceId: "E01" }],
    observations: [{ observationId: "OBS_01", objectId: "OBJ_01", text: "Vas pecah." }],
    evidence: [{ evidenceId: "E01", objectId: "OBJ_01", truthStatus: "TRUE", relevance: "DIRECT" }],
    suspects: [{ suspectId: "S01", name: "Nona X", relationship: "r", occupation: "o", publicProfile: "p" }],
    statements: [{ statementId: "ST01", suspectId: "S01", text: "Saya di sini.", claim: { subject: "X", predicate: "di", value: "sini" } }],
    dialogueNodes: [{ nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "Saya di sini." }, unlocksStatementId: "ST01" }],
    timelineEvents: [{ eventId: "T01", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_01", actorIds: ["S01"], action: "Masuk", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: ["ST01"] }],
    causalRelations: [{ dari: "E01", ke: "T01", jenis: "REQUIRES" }, { dari: "T01", ke: "SOL_01", jenis: "CAUSES" }],
    proofNodes: [{ nodeId: "E01", kind: "EVIDENCE" }, { nodeId: "T01", kind: "EVENT" }, { nodeId: "SOL_01", kind: "SOLUTION_FACT" }],
    proofEdges: [{ dari: "E01", ke: "T01", relasi: "SUPPORTS", wajib: true }, { dari: "T01", ke: "SOL_01", relasi: "ESTABLISHES", wajib: true }],
    contradictionDefinitions: [{ contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01", unlocksNodeId: "D01" }],
    motiveId: "M",
    methodId: "M",
  };
}

function kandidatJson(caseId: string, versionId: string, ref: string): string {
  const bible = bibleMini(caseId, ref);
  return JSON.stringify({
    caseId, versionId, title: "Mini", premise: "Premis mini.", genre: "MYSTERY", tags: ["mini"],
    caseBible: bible,
  });
}

const seed: BenihKasus = { genre: "MYSTERY", setting: "hall", difficulty: "MEDIUM", suspectCount: 1, sceneCount: 1, mustUseMechanics: [] };

test("generateCase menyimpan CaseBible AI sehingga case langsung playable", async () => {
  const tersimpanBible: CaseBible[] = [];
  const tersimpanVersi: unknown[] = [];
  const layanan = new LayananProduksiKasus({
    konfigurasi: {
      caseGenerationEnabled: true,
      penyediaTeks: new FakeAiProvider([kandidatJson("CASE-AI-1", "v1", "case-bible:CASE-AI-1:v1")]),
      penyediaGambar: undefined,
      providerName: "fake-ai",
      opsiGenerasi: { maxRetries: 0 },
    },
    repositoriVersi: { simpanVersiKasus: async (v) => { tersimpanVersi.push(v); return v; } },
    repositoriAset: new RepositoriAsetVisualMemori(),
    repositoriBible: { simpanCaseBible: async (b) => { tersimpanBible.push(b); } },
  });

  const kandidat = await layanan.generateCase(seed);
  assert.equal(kandidat.caseId, "CASE-AI-1");
  assert.equal(tersimpanVersi.length, 1);
  assert.equal(tersimpanBible.length, 1);
  assert.equal(tersimpanBible[0]?.caseBibleRef, "case-bible:CASE-AI-1:v1");
  assert.ok((tersimpanBible[0]?.suspects.length ?? 0) > 0);
});

test("gabungan: golden dari statis, bible AI dari firestore", async () => {
  const statis = new RepositoriCaseBibleStatis([{ ...goldenCaseBible, caseBibleRef: "case-bible:CASE-001:golden" }]);
  const bibleAi = bibleMini("CASE-AI-9", "case-bible:CASE-AI-9:v9");
  const firestoreRepo = {
    ambilCaseBible: async (ref: string) => (ref === "case-bible:CASE-AI-9:v9" ? bibleAi : null),
  };
  const gabungan = new RepositoriCaseBibleGabungan(statis, firestoreRepo);

  const golden = await gabungan.ambilCaseBible("case-bible:CASE-001:golden");
  assert.ok(golden, "golden tetap dari statis");
  assert.equal(golden?.suspects[0]?.name, "Marcus Bell");

  const ai = await gabungan.ambilCaseBible("case-bible:CASE-AI-9:v9");
  assert.ok(ai, "bible AI dari firestore");
  assert.equal(ai?.suspects[0]?.name, "Nona X");

  assert.equal(await gabungan.ambilCaseBible("case-bible: entah: x"), null);
});
