import test from "node:test";
import assert from "node:assert/strict";

import { handlerInternal } from "../../api/admin.js";
import { buatKomposisiUji } from "./setup-komposisi.js";
import { FakeAiProvider } from "../../src/ai/fake-provider.js";
import { PenyediaGambarPalsu } from "../../src/ai/visual-pipeline.js";
import { bacaKonfigurasiAi } from "../../src/ai/konfigurasi.js";
import { KesalahanProviderAi } from "../../src/ai/errors.js";
import type { PintuAi } from "../../src/ai/contracts.js";
import { buatIdKasus, buatIdVersiKasus } from "../../src/fondasi/primitif.js";
import { StatusVersiKasus } from "../../src/kasus/versi-kasus.js";

const TOKEN = "admin-secret-token-ai-0123456789abcdef";
process.env.ADMIN_SECRET_TOKEN = TOKEN;

// provider "gemini" + api key → caseGenerationEnabled default TRUE (admin/offline).
const KONFIG_AI = bacaKonfigurasiAi({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "kunci-hanya-untuk-tes" });

function req(action: string, payload: Record<string, unknown> = {}): { method: string; headers: Record<string, string>; body: Record<string, unknown> } {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: { action, adminId: "admin-ai", payload },
  };
}

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
test("AI admin: generateCase → 200 + kandidat; versi DRAFT dipersisten (menunggu publish aset — Part C)", async () => {
  const teks = new FakeAiProvider([JSON.stringify(buatResponValidCandidate())]);
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI, penyediaTeks: teks });

  const res = await handlerInternal(
    req("generateCase", { seed: { genre: "MYSTERY", setting: "hospital", suspectCount: 2, sceneCount: 1 } }),
    komposisi,
  );

  assert.equal(res.status, 200);
  const body = JSON.parse(res.body) as { ok: boolean; candidate: { caseId: string; versionId: string; title: string } };
  assert.equal(body.ok, true);
  assert.equal(body.candidate.caseId, "CASE-900");
  assert.ok(body.candidate.versionId);

  const versi = await komposisi.repositoriVersiKasus.ambilVersiKasus(buatIdKasus("CASE-900"), buatIdVersiKasus("v-900"));
  // Part C production flow: generateCase menyimpan DRAFT (immutable), BUKAN langsung
  // PUBLISHED. Publikasi hanya terjadi via admin publishCase setelah asset durable lengkap.
  assert.equal(versi?.status, StatusVersiKasus.DRAFT);
  assert.equal(versi?.publishedAt, undefined);
  assert.ok(!res.body.includes(TOKEN));
});

test("AI admin: generateCase provider 5xx → 503 provider_error dengan kategori (tanpa rahasia)", async () => {
  const gagal: PintuAi = {
    generateText: async () => {
      throw new KesalahanProviderAi("Gemini HTTP 503 (overloaded).", "PROVIDER_UNAVAILABLE", 503);
    },
  };
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI, penyediaTeks: gagal });

  const res = await handlerInternal(req("generateCase", { seed: { genre: "MYSTERY" } }), komposisi);

  assert.equal(res.status, 503);
  const body = JSON.parse(res.body) as { ok: boolean; error: string; kategori: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "provider_error");
  assert.equal(body.kategori, "PROVIDER_UNAVAILABLE");
  assert.ok(!res.body.includes(TOKEN));
});

test("AI admin: generateCase DISABLED → 503 (feature flag off)", async () => {
  const cfg = bacaKonfigurasiAi({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", AI_CASE_GENERATION_ENABLED: "false" });
  const teks = new FakeAiProvider([JSON.stringify(buatResponValidCandidate())]);
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: cfg, penyediaTeks: teks });

  const res = await handlerInternal(req("generateCase", { seed: { genre: "MYSTERY" } }), komposisi);
  assert.equal(res.status, 503);
  const body = JSON.parse(res.body) as { kategori: string };
  assert.equal(body.kategori, "DISABLED");
});

test("AI admin: generateImages → 200 + manifest; aset persisten di visual_assets (metadata, bukan binary)", async () => {
  const keluaran = JSON.stringify({
    uri: "https://cdn.ujian.test/PLAN-01.png",
    status: "READY",
    format: "image/png",
    sizeBytes: 150000,
    requiredClues: ["CLUE-01"],
    forbiddenClues: [],
    verifyNotes: ["clue terverifikasi via metadata"],
  });
  const gambar = new PenyediaGambarPalsu([keluaran]);
  const { komposisi, firestore } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI, penyediaGambar: gambar });

  const res = await handlerInternal(
    req("generateImages", {
      caseId: "CASE-ADMIN-01",
      plans: [
        {
          planId: "PLAN-01",
          sceneId: "SCENE_01",
          purpose: "CRIME_SCENE",
          requiredClues: [{ id: "CLUE-01", label: "Glass shard", entityId: "E01", kind: "evidence" }],
          forbiddenClues: [],
          inspectableObjects: ["Medicine cabinet"],
        },
      ],
    }),
    komposisi,
  );

  assert.equal(res.status, 200);
  const body = JSON.parse(res.body) as {
    ok: boolean;
    manifest: { caseId: string; assetCount: number; assets: Array<{ assetId: string; uri: string; status: string }> };
  };
  assert.equal(body.ok, true);
  assert.equal(body.manifest.caseId, "CASE-ADMIN-01");
  assert.equal(body.manifest.assetCount, 1);
  assert.equal(body.manifest.assets[0]?.assetId, "ASSET-PLAN-01");
  assert.ok(body.manifest.assets[0]?.uri);

  assert.equal(gambar.calls.length, 1);
  assert.equal(firestore.jumlahDokumen("visual_assets"), 1);
  assert.ok(firestore.jumlahDokumen("visual_asset_manifests") >= 1);
});

test("AI admin: generateImages tanpa caseId/plans → 400 (input validation)", async () => {
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI, penyediaGambar: new PenyediaGambarPalsu([]) });
  const res = await handlerInternal(req("generateImages", { caseId: "" }), komposisi);
  assert.equal(res.status, 400);
});

test("AI admin: rejectCandidate → 200 documented no-op (kandidat tak valid tak pernah dipublish)", async () => {
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI });
  const res = await handlerInternal(req("rejectCandidate", { caseId: "CASE-900", versionId: "v-900" }), komposisi);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body) as { ok: boolean; message: string };
  assert.equal(body.ok, true);
  assert.ok(body.message.length > 0);
});

test("AI admin: regenerateCase → 400 unsupported action", async () => {
  const { komposisi } = buatKomposisiUji({}, { konfigurasiAi: KONFIG_AI });
  const res = await handlerInternal(req("regenerateCase", { caseId: "CASE-900" }), komposisi);
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).error, "unsupported admin action");
});