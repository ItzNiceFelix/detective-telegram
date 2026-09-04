import test from "node:test";
import assert from "node:assert/strict";

import { GeminiTextProvider } from "../../src/infrastructure/adapters/ai/gemini-text.js";
import { uraiTotalTokens, uraiUsageMetadata } from "../../src/infrastructure/adapters/ai/gemini-net.js";
import {
  buatPenerimaTelemetriAi,
  petungOperasiAi,
  type CatatanTelemetriAi,
} from "../../src/infrastructure/adapters/ai/telemetri-ai.js";
import type { LoggerStruktur } from "../../src/observability/logger.js";
import { buatKandidatKasus, type BenihKasus, type KandidatKasus } from "../../src/kasus/generasi-kasus.js";
import type { PintuAi, PermintaanAi, ResponAi } from "../../src/ai/contracts.js";

function buatCaseBibleValid(): unknown {
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
    statements: [{ statementId: "ST01", suspectId: "S01", text: "I never left the ward.", claim: { subject: "Mira", predicate: "was in", value: "the ward" } }],
    dialogueNodes: [{ nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "I never left the ward." }, unlocksStatementId: "ST01" }],
    timelineEvents: [
      { eventId: "T01", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_01", actorIds: ["S01"], action: "Mira enters the ward", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: ["ST01"] },
      { eventId: "T02", timestamp: { precision: "EXACT", start: "21:30" }, locationId: "SCENE_01", actorIds: ["S02"], action: "Owen checks cabinet", truthStatus: "TRUE", relatedEvidenceIds: ["E02"], relatedStatementIds: [] },
    ],
    causalRelations: [{ dari: "E01", ke: "T01", jenis: "REQUIRES" }, { dari: "T01", ke: "SOL_01", jenis: "CAUSES" }],
    proofNodes: [{ nodeId: "E01", kind: "EVIDENCE" }, { nodeId: "T01", kind: "EVENT" }, { nodeId: "SOL_01", kind: "SOLUTION_FACT" }],
    proofEdges: [{ dari: "E01", ke: "T01", relasi: "SUPPORTS", wajib: true }, { dari: "T01", ke: "SOL_01", relasi: "ESTABLISHES", wajib: true }],
    contradictionDefinitions: [{ contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01", unlocksNodeId: "D01" }],
  };
}

/** Mock fetch + routing berdasar endpoint path (generateContent vs countTokens). */
function buatMockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  type InputFetch = Parameters<typeof fetch>[0];
  const impl = (async (input: InputFetch, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input.toString();
    return handler(urlStr, init);
  }) as typeof fetch;
  return impl;
}

function responsJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function dataTeksGemini(teks: string, usage?: Record<string, unknown>): unknown {
  return {
    candidates: [{ content: { parts: [{ text: teks }] }, finishReason: "STOP" }],
    ...(usage ? { usageMetadata: usage } : {}),
  };
}

function loggerPenangkap(catatan: Array<{ message: string; context?: Record<string, unknown> | undefined }>): LoggerStruktur {
  return {
    info: (message: string, context?: Record<string, unknown>) => {
      catatan.push(context === undefined ? { message } : { message, context });
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerStruktur;
}

// ===== uraiUsageMetadata / uraiTotalTokens =====

test("usage metadata provider ter-parse ke token generik (input/output/total/thinking)", () => {
  const usage = uraiUsageMetadata({
    usageMetadata: {
      promptTokenCount: 120,
      candidatesTokenCount: 340,
      totalTokenCount: 460,
      thoughtsTokenCount: 55,
    },
  });
  assert.deepEqual(usage, { tokenInput: 120, tokenOutput: 340, tokenTotal: 460, tokenThinking: 55 });
});

test("usage metadata provider hilang → object kosong (aman, tanpa throw)", () => {
  assert.deepEqual(uraiUsageMetadata({ candidates: [] }), {});
  assert.deepEqual(uraiUsageMetadata({ usageMetadata: null }), {});
  assert.deepEqual(uraiUsageMetadata(null), {});
  assert.deepEqual(uraiUsageMetadata({ usageMetadata: { promptTokenCount: "bukan-angka" } }), {
    tokenInput: undefined,
    tokenOutput: undefined,
    tokenTotal: undefined,
    tokenThinking: undefined,
  });
});

test("uraiTotalTokens (countTokens) → number; gagal/absen → null", () => {
  assert.equal(uraiTotalTokens({ totalTokens: 77 }), 77);
  assert.equal(uraiTotalTokens({}), null);
  assert.equal(uraiTotalTokens(null), null);
  assert.equal(uraiTotalTokens({ totalTokens: -3 }), null);
});

test("petungOperasiAi: case_generation → CASE_GENERATION", () => {
  assert.equal(petungOperasiAi("case_generation"), "CASE_GENERATION");
  assert.equal(petungOperasiAi("dialogue"), "DIALOGUE");
});

// ===== GeminiTextProvider — usage di ResponAi =====

test("telemetri: usageMetadata response terbawa ke ResponAi.usage (prioritas 1)", async () => {
  const fetchImpl = buatMockFetch(async () =>
    responsJson(
      dataTeksGemini("halo", {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
        thoughtsTokenCount: 2,
      }),
    ),
  );
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl });
  const res = await provider.generateText({ promptType: "dialogue", context: {} });
  assert.equal(res.output, "halo");
  assert.deepEqual(res.usage, { tokenInput: 10, tokenOutput: 20, tokenTotal: 30, tokenThinking: 2 });
});

test("telemetri: respons tanpa usageMetadata → usage undefined (tidak bocor, tidak rusak)", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson(dataTeksGemini("halo")));
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl });
  const res = await provider.generateText({ promptType: "dialogue", context: {} });
  assert.equal(res.output, "halo");
  assert.equal(res.usage, undefined);
});

// ===== countTokens preflight opsional & gagal-aman =====

test("telemetri: countTokens preflight gagal TIDAK menggagalkan generation (tokenInput null-safe)", async () => {
  const fetchImpl = buatMockFetch(async (url) => {
    if (url.includes(":countTokens")) return responsJson({ error: { message: "boom" } }, 500);
    return responsJson(dataTeksGemini("hasil"));
  });
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl, countTokensEnabled: true });
  const res = await provider.generateText({ promptType: "dialogue", context: {} });
  assert.equal(res.output, "hasil");
  assert.equal(res.usage, undefined);
});

test("telemetri: countTokens preflight sukses → tokenInput dari preflight bila response tanpa usage", async () => {
  const fetchImpl = buatMockFetch(async (url) => {
    if (url.includes(":countTokens")) return responsJson({ totalTokens: 99 });
    return responsJson(dataTeksGemini("hasil"));
  });
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl, countTokensEnabled: true });
  const res = await provider.generateText({ promptType: "dialogue", context: {} });
  assert.equal(res.usage?.tokenInput, 99);
});

// ===== structured log ai_generation_usage =====

test("log ai_generation_usage: berisi operation CASE_GENERATION, latency, attempt, status — tanpa prompt/secret", async () => {
  const catatanLog: Array<{ message: string; context?: Record<string, unknown> | undefined }> = [];
  const penerima = buatPenerimaTelemetriAi(loggerPenangkap(catatanLog), "gemini", "model-tes");
  const fetchImpl = buatMockFetch(async () =>
    responsJson(dataTeksGemini(`{"ok":true}`, { promptTokenCount: 5, candidatesTokenCount: 6, totalTokenCount: 11 })),
  );
  const provider = new GeminiTextProvider({ apiKey: "RAHASIA-TIDAK-BOLEH-MUNCUL", model: "model-tes", fetchImpl, telemetri: penerima });
  await provider.generateText({ promptType: "case_generation", context: { rahasia: "PROMPT-TIDAK-BOLEH-MUNCUL" } });

  assert.equal(catatanLog.length, 1);
  const entry = catatanLog[0];
  assert.ok(entry);
  assert.equal(entry.message, "ai_generation_usage");
  const ctx = entry.context ?? {};
  assert.equal(ctx["provider"], "gemini");
  assert.equal(ctx["model"], "model-tes");
  assert.equal(ctx["operation"], "CASE_GENERATION");
  assert.equal(ctx["tokenInput"], 5);
  assert.equal(ctx["tokenOutput"], 6);
  assert.equal(ctx["tokenTotal"], 11);
  assert.ok(typeof ctx["durationMs"] === "number");
  assert.equal(ctx["attempt"], 1);
  assert.equal(ctx["status"], 200);
  const serial = JSON.stringify(entry);
  assert.ok(!serial.includes("RAHASIA-TIDAK-BOLEH-MUNCUL"));
  assert.ok(!serial.includes("PROMPT-TIDAK-BOLEH-MUNCUL"));
});

test("log ai_generation_usage pada 429: tetap tercatat (attempt + status 429) walau generation melempar", async () => {
  const catatanLog: Array<{ message: string; context?: Record<string, unknown> | undefined }> = [];
  const catatanMentah: CatatanTelemetriAi[] = [];
  const penerima = buatPenerimaTelemetriAi(loggerPenangkap(catatanLog), "gemini", "m");
  const penerimaGabung = (c: CatatanTelemetriAi): void => {
    catatanMentah.push(c);
    penerima(c);
  };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "quota" } }, 429));
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl, maxRetries: 0, telemetri: penerimaGabung });

  await assert.rejects(() => provider.generateText({ promptType: "case_generation", context: {} }));
  assert.equal(catatanLog.length, 1);
  assert.equal(catatanLog[0]?.message, "ai_generation_usage");
  assert.equal(catatanLog[0]?.context?.["status"], 429);
  assert.equal(catatanLog[0]?.context?.["attempt"], 1);
  assert.equal(catatanMentah[0]?.tokenInput, undefined);
});

// ===== telemetri tidak memutasi domain state =====

const BENIH: BenihKasus = {
  genre: "MYSTERY",
  setting: "lab",
  difficulty: "MEDIUM",
  suspectCount: 3,
  sceneCount: 2,
  mustUseMechanics: [],
};

function penyediaOutputTetap(output: string, usage?: ResponAi["usage"]): PintuAi {
  return {
    generateText: async (_req: PermintaanAi): Promise<ResponAi> => ({ output, warnings: [], usage }),
  };
}

test("telemetri token tidak memutasi domain: kandidat identik dengan/tanpa usage metadata", async () => {
  const payload = JSON.stringify({ caseBible: buatCaseBibleValid(), title: "The Locked Ward" });
  const tanpa: KandidatKasus = await buatKandidatKasus(BENIH, penyediaOutputTetap(payload), { maxRetries: 0 });
  const dengan: KandidatKasus = await buatKandidatKasus(
    BENIH,
    penyediaOutputTetap(payload, { tokenInput: 1, tokenOutput: 2, tokenTotal: 3, tokenThinking: 4 }),
    { maxRetries: 0 },
  );
  assert.deepEqual({ ...dengan, generation: { ...dengan.generation, generatedAt: "T" } }, {
    ...tanpa,
    generation: { ...tanpa.generation, generatedAt: "T" },
  });
  const serial = JSON.stringify(dengan);
  assert.ok(!serial.includes("tokenInput") && !serial.includes("tokenTotal"));
});
