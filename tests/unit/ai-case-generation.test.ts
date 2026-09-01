import test from "node:test";
import assert from "node:assert/strict";

import { FakeAiProvider } from "../../src/ai/fake-provider.js";
import { buatKandidatKasus, validasiGerbangPublikasi, validasiLinimasa, validasiReferensiKasus, validasiStrukturKasus, ujiKeunikanSolusi, ujiKeterpecahanKasus } from "../../src/kasus/generasi-kasus.js";

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

test("valid candidate passes generation + publish gate", async () => {
  const provider = new FakeAiProvider([{ output: JSON.stringify(buatResponValidCandidate()), warnings: [] }]);
  const kandidat = await buatKandidatKasus({
    genre: "MYSTERY",
    setting: "hospital",
    difficulty: "DETECTIVE",
    suspectCount: 2,
    sceneCount: 1,
    mustUseMechanics: ["timeline_contradiction"],
  }, provider, { maxRetries: 1, provider: "fake-ai" });

  assert.equal(kandidat.caseId, "CASE-900");
  assert.equal(validasiStrukturKasus(kandidat), undefined);
  assert.equal(validasiReferensiKasus(kandidat), undefined);
  assert.equal(validasiLinimasa(kandidat), undefined);
  assert.equal(ujiKeterpecahanKasus(kandidat), true);
  assert.equal(ujiKeunikanSolusi(kandidat), true);
  assert.equal(validasiGerbangPublikasi(kandidat).valid, true);
});

test("malformed JSON triggers bounded retry and succeeds on retry", async () => {
  const provider = new FakeAiProvider([
    { output: "{bad json", warnings: [] },
    { output: JSON.stringify(buatResponValidCandidate()), warnings: [] },
  ]);

  const kandidat = await buatKandidatKasus({
    genre: "MYSTERY",
    setting: "hospital",
    difficulty: "DETECTIVE",
    suspectCount: 2,
    sceneCount: 1,
    mustUseMechanics: ["timeline_contradiction"],
  }, provider, { maxRetries: 1, provider: "fake-ai" });

  assert.equal(provider.calls.length, 2);
  assert.equal(kandidat.caseId, "CASE-900");
});

test("invalid schema gets rejected without publish", async () => {
  const provider = new FakeAiProvider([{ output: JSON.stringify({ notACase: true }), warnings: [] }]);

  await assert.rejects(
    () => buatKandidatKasus({
      genre: "MYSTERY",
      setting: "hospital",
      difficulty: "DETECTIVE",
      suspectCount: 2,
      sceneCount: 1,
      mustUseMechanics: ["timeline_contradiction"],
    }, provider, { maxRetries: 0, provider: "fake-ai" }),
    /Case Bible harus memiliki timeline|Struktur Case Bible tidak lengkap|Kandidat kasus gagal validasi/,
  );
});

test("dangling reference is rejected", () => {
  const kandidat = {
    caseId: "CASE-901",
    versionId: "v-901",
    caseBibleRef: "case-bible:CASE-901:main",
    assetManifestRef: "assets:CASE-901:v-901:manifest",
    metadata: { title: "Broken case", premise: "Broken", genre: "MYSTERY", starRating: 4, tags: ["broken"] },
    caseBible: { ...buatCaseBibleValid(), proofEdges: [{ dari: "UNKNOWN", ke: "SOL_01", relasi: "SUPPORTS", wajib: true }] },
    generation: { generatorVersion: "v1", promptVersion: "prompt", schemaVersion: 1, provider: "tests", generatedAt: new Date().toISOString(), validationSummary: [] },
  };

  assert.throws(() => validasiReferensiKasus(kandidat as any), /Edge proof|merujuk node|UNKNOWN/);
});

test("timeline contradiction is rejected", () => {
  const kandidat = {
    ...buatResponValidCandidate(),
    caseBible: { ...buatCaseBibleValid(), timelineEvents: [
      { eventId: "T01", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_01", actorIds: ["S01"], action: "arrives", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: ["ST01"] },
      { eventId: "T02", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_02", actorIds: ["S01"], action: "leaves", truthStatus: "TRUE", relatedEvidenceIds: ["E02"], relatedStatementIds: [] },
    ] },
  };

  assert.throws(() => validasiLinimasa({
    caseId: "CASE-902",
    versionId: "v-902",
    caseBibleRef: "case-bible:CASE-902:main",
    assetManifestRef: "assets:CASE-902:v-902:manifest",
    metadata: { title: "Broken", premise: "Broken", genre: "MYSTERY", starRating: 4, tags: ["broken"] },
    caseBible: kandidat.caseBible,
    generation: { generatorVersion: "v1", promptVersion: "prompt", schemaVersion: 1, provider: "tests", generatedAt: new Date().toISOString(), validationSummary: [] },
  } as any), /Gerakan actor|waktu yang sama/);
});

test("unsafe content is rejected by moderation gate", () => {
  const kandidat = {
    ...buatResponValidCandidate(),
    metadata: { ...buatResponValidCandidate().metadata, title: "Secret Password Leak" },
  };

  assert.throws(() => validasiGerbangPublikasi(kandidat as any, { validasiSemua: true }), /moderasi|Secret Password Leak/);
});
