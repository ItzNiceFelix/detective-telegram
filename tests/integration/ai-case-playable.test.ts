import test from "node:test";
import assert from "node:assert/strict";

import { buatKomposisiUji, prosesPerintah } from "./setup-komposisi.js";
import { FakeAiProvider } from "../../src/ai/fake-provider.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { StatusVersiKasus } from "../../src/kasus/versi-kasus.js";
import type { CaseBible } from "../../src/kasus/case-bible.js";

const CHAT = "-1001";
const ADMIN = `${CHAT}:42`;

function bibleAi(caseId: string, ref: string): CaseBible {
  return {
    caseBibleRef: ref,
    caseId: caseId as never,
    title: "The Gilded Cellar",
    victim: "Lord Ash",
    culpritSuspectId: "S01",
    scenes: [{ sceneId: "CELLAR", name: "Cellar" }],
    objects: [{ objectId: "OBJ_BOTTLE", sceneId: "CELLAR", name: "Bottle", modeDiscovery: "AUTO", evidenceId: "E01" }],
    observations: [{ observationId: "OBS_01", objectId: "OBJ_BOTTLE", text: "Botol pecah." }],
    evidence: [{ evidenceId: "E01", objectId: "OBJ_BOTTLE", truthStatus: "TRUE", relevance: "DIRECT" }],
    suspects: [{ suspectId: "S01", name: "Butler Gray", relationship: "pelayan", occupation: "Butler", publicProfile: "Setia." }],
    statements: [{ statementId: "ST01", suspectId: "S01", text: "Saya di dapur.", claim: { subject: "Gray", predicate: "di", value: "dapur" } }],
    dialogueNodes: [{ nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "Saya di dapur." }, unlocksStatementId: "ST01" }],
    timelineEvents: [{ eventId: "T01", timestamp: { precision: "EXACT", start: "22:00" }, locationId: "CELLAR", actorIds: ["S01"], action: "Masuk cellar", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: [] }],
    causalRelations: [{ dari: "E01", ke: "T01", jenis: "REQUIRES" }, { dari: "T01", ke: "SOL_01", jenis: "CAUSES" }],
    proofNodes: [{ nodeId: "E01", kind: "EVIDENCE" }, { nodeId: "T01", kind: "EVENT" }, { nodeId: "SOL_01", kind: "SOLUTION_FACT" }],
    proofEdges: [{ dari: "E01", ke: "T01", relasi: "SUPPORTS", wajib: true }, { dari: "T01", ke: "SOL_01", relasi: "ESTABLISHES", wajib: true }],
    contradictionDefinitions: [{ contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01", unlocksNodeId: "D01" }],
    motiveId: "M",
    methodId: "M",
  };
}

/**
 * PRODUCTION-READY: case AI hasil generate → bible tersimpan di Firestore →
 * publish → newcase/startcase/suspects/investigate playable (bukan golden).
 */
test("case AI playable end-to-end: generate → publish → suspects/investigate/inspect/interrogate", async () => {
  const bible = bibleAi("CASE-AI-INT", "case-bible:CASE-AI-INT:v1");
  const kandidatJson = JSON.stringify({
    caseId: "CASE-AI-INT", versionId: "v1", title: "The Gilded Cellar",
    premise: "Premis.", genre: "MYSTERY", tags: ["ai"], caseBible: bible,
  });

  const ctx = buatKomposisiUji(
    { [ADMIN]: "administrator" },
    {
      penyediaTeks: new FakeAiProvider([kandidatJson]),
      konfigurasiAi: {
        provider: "fake",
        textModel: "fake-text",
        imageModel: "fake-image",
        caseGenerationEnabled: true,
        runtimeNarrativeEnabled: false,
        assistantEnabled: false,
        geminiApiKey: undefined,
        timeoutMs: 15000,
        maxRetries: 0,
        maxOutputTokens: 4000,
        maxGenerationAttempts: 3,
        textReady: true,
        imageReady: false,
      },
    },
  );

  const kandidat = await ctx.komposisi.layananProduksiKasus.generateCase({
    genre: "mystery", setting: "cellar", difficulty: "MEDIUM", suspectCount: 1, sceneCount: 1, mustUseMechanics: [],
  });
  assert.equal(kandidat.caseId, "CASE-AI-INT");

  const docBible = ctx.firestore.ambilDokumen("case_bibles", "case-bible:CASE-AI-INT:v1");
  assert.ok(docBible, "bible AI harus tersimpan di Firestore");

  // publish DRAFT (bypass gate aset: simpan versi PUBLISHED langsung)
  const draft = ctx.firestore.ambilDokumen("case_versions", "CASE-AI-INT:v1");
  assert.ok(draft, "versi DRAFT tersimpan");
  ctx.firestore.refDokumen("case_versions", "CASE-AI-INT:v1").set({ ...(draft as Record<string, unknown>), status: StatusVersiKasus.PUBLISHED });

  const baru = await prosesPerintah(ctx.komposisi, 701, "/newcase", CHAT, 42);
  assert.equal(baru.status, "berhasil");
  const mulai = await prosesPerintah(ctx.komposisi, 702, "/startcase", CHAT, 42);
  assert.equal(mulai.status, "berhasil");
  if (mulai.status === "berhasil") assert.equal(mulai.data.session?.status, StatusSesi.OPEN);

  const sus = await prosesPerintah(ctx.komposisi, 703, "/suspects", CHAT, 42);
  assert.equal(sus.status, "berhasil");
  assert.match(String(sus.status === "berhasil" ? sus.data.message : ""), /Butler Gray/);

  const inv = await prosesPerintah(ctx.komposisi, 704, "/investigate CELLAR", CHAT, 42);
  assert.equal(inv.status, "berhasil");
  const insp = await prosesPerintah(ctx.komposisi, 705, "/inspect OBJ_BOTTLE", CHAT, 42);
  assert.equal(insp.status, "berhasil");
  const intro = await prosesPerintah(ctx.komposisi, 706, "/interrogate S01 ASK_ALIBI", CHAT, 42);
  assert.equal(intro.status, "berhasil");

  const timeline = await prosesPerintah(ctx.komposisi, 707, "/timeline", CHAT, 42);
  assert.equal(timeline.status, "berhasil");
  const kontra = await prosesPerintah(ctx.komposisi, 708, "/contradictions", CHAT, 42);
  assert.equal(kontra.status, "berhasil");
});
