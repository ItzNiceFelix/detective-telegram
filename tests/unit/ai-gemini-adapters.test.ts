import test from "node:test";
import assert from "node:assert/strict";

import { GeminiTextProvider } from "../../src/infrastructure/adapters/ai/gemini-text.js";
import { GeminiImageProvider } from "../../src/infrastructure/adapters/ai/gemini-image.js";
import {
  ambilImageInline,
  ambilTeksDariRespons,
  klasifikasikanStatus,
  panggilGemini,
} from "../../src/infrastructure/adapters/ai/gemini-net.js";
import { KesalahanProviderAi, layakRetry } from "../../src/ai/errors.js";

/** Mock fetch + counter panggilan (untuk assert kebijakan retry). */
function buatMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  let calls = 0;
  type InputFetch = Parameters<typeof fetch>[0];
  const impl = (async (input: InputFetch, init?: RequestInit) => {
    calls += 1;
    const urlStr = typeof input === "string" ? input : input.toString();
    return handler(urlStr, init);
  }) as typeof fetch;
  return { impl, panggil: () => calls };
}

function responsJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function responsTeks(isi: string, status = 200): Response {
  return new Response(isi, { status });
}

function errorJaringan(): Error {
  return new TypeError("fetch failed");
}

function errorTimeout(): Error {
  const error = new Error("operation aborted by timeout");
  error.name = "TimeoutError";
  return error;
}

const OPSI_NET = {
  apiKey: "kunci-tes",
  model: "model-tes",
  endpointPath: "generateContent" as const,
  payload: { contents: [] },
  timeoutMs: 1000,
  apiBase: "https://api.ujian.test",
};

test("panggilGemini: POST ke endpoint model + header x-goog-api-key; parse JSON", async () => {
  let urlTangkap = "";
  let headerTangkap: Record<string, string> = {};
  const { impl } = buatMockFetch(async (url, init) => {
    urlTangkap = url;
    headerTangkap = (init?.headers ?? {}) as Record<string, string>;
    return responsJson({ candidates: [] });
  });

  const res = await panggilGemini({ ...OPSI_NET, fetchImpl: impl });

  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { candidates: [] });
  assert.ok(urlTangkap.startsWith("https://api.ujian.test/v1beta/models/model-tes:generateContent"));
  assert.equal(headerTangkap["x-goog-api-key"], "kunci-tes");
});

test("panggilGemini: gagal jaringan → PROVIDER_UNAVAILABLE (layak retry)", async () => {
  const { impl } = buatMockFetch(() => {
    throw errorJaringan();
  });
  await assert.rejects(
    () => panggilGemini({ ...OPSI_NET, fetchImpl: impl }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "PROVIDER_UNAVAILABLE");
      assert.equal(layakRetry(err), true);
      return true;
    },
  );
});

test("panggilGemini: timeout → TIMEOUT (layak retry)", async () => {
  const { impl } = buatMockFetch(() => {
    throw errorTimeout();
  });
  await assert.rejects(
    () => panggilGemini({ ...OPSI_NET, fetchImpl: impl }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "TIMEOUT");
      assert.equal(layakRetry(err), true);
      return true;
    },
  );
});

test("panggilGemini: body bukan JSON pada 2xx → INVALID_RESPONSE", async () => {
  const { impl } = buatMockFetch(async () => responsTeks("<html>gateway</html>"));
  await assert.rejects(
    () => panggilGemini({ ...OPSI_NET, fetchImpl: impl }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "INVALID_RESPONSE");
      return true;
    },
  );
});

test("klasifikasikanStatus: petakan kode HTTP ke kategori AI", () => {
  assert.equal(klasifikasikanStatus(200), null);
  assert.equal(klasifikasikanStatus(201), null);
  assert.equal(klasifikasikanStatus(401), "AUTHENTICATION");
  assert.equal(klasifikasikanStatus(403), "AUTHENTICATION");
  assert.equal(klasifikasikanStatus(429), "QUOTA_RATE_LIMIT");
  assert.equal(klasifikasikanStatus(500), "PROVIDER_UNAVAILABLE");
  assert.equal(klasifikasikanStatus(503), "PROVIDER_UNAVAILABLE");
  assert.equal(klasifikasikanStatus(400), "INVALID_RESPONSE");
});

test("ambilTeksDariRespons / ambilImageInline: ekstraksi bagian kandidat pertama", () => {
  const dataTeks = { candidates: [{ content: { parts: [{ text: "halo " }, { text: "dunia" }] } }] };
  assert.equal(ambilTeksDariRespons(dataTeks), "halo dunia");
  assert.equal(ambilTeksDariRespons({ candidates: [] }), null);

  const dataGambar = {
    candidates: [{ content: { parts: [{ text: "diabaikan" }, { inlineData: { mimeType: "image/png", data: "QkE=" } }] } }],
  };
  assert.deepEqual(ambilImageInline(dataGambar), { mimeType: "image/png", data: "QkE=" });
  assert.equal(ambilImageInline(dataTeks), null);
});
// ===== GeminiTextProvider =====

function dataTeksGemini(teks: string): unknown {
  return { candidates: [{ content: { parts: [{ text: teks }] }, finishReason: "STOP" }] };
}

test("text: sukses → { output, warnings }; JSON mime untuk case_generation; maxTokens dibatasi", async () => {
  let payloadTangkap: any = {};
  const { impl } = buatMockFetch(async (_url, init) => {
    payloadTangkap = JSON.parse(String(init?.body));
    return responsJson(dataTeksGemini('{"title":"Locked Ward"}'));
  });

  const provider = new GeminiTextProvider({ apiKey: "kunci-tes", model: "model-tes", fetchImpl: impl, maxOutputTokens: 800 });
  const res = await provider.generateText({ promptType: "case_generation", context: { genre: "MYSTERY" }, maxTokens: 500 });

  assert.equal(res.output, '{"title":"Locked Ward"}');
  assert.deepEqual(res.warnings, []);
  assert.equal(payloadTangkap.generationConfig.responseMimeType, "application/json");
  assert.equal(payloadTangkap.generationConfig.maxOutputTokens, 500);
  assert.ok(payloadTangkap.safetySettings.length > 0);
});

test("text: 401 → AUTHENTICATION, TANPA retry, kodeMekanis = 401", async () => {
  const { impl, panggil } = buatMockFetch(async () => responsJson({ error: { message: "API key invalid" } }, 401));
  const provider = new GeminiTextProvider({ apiKey: "salah", model: "m", fetchImpl: impl, maxRetries: 3 });

  await assert.rejects(
    () => provider.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "AUTHENTICATION");
      assert.equal(err.kodeMekanis, 401);
      return true;
    },
  );
  assert.equal(panggil(), 1);
});

test("text: 429 → QUOTA_RATE_LIMIT, TANPA retry", async () => {
  const { impl, panggil } = buatMockFetch(async () => responsJson({ error: { message: "quota exhausted" } }, 429));
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 2 });

  await assert.rejects(
    () => provider.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "QUOTA_RATE_LIMIT");
      assert.equal(err.kodeMekanis, 429);
      return true;
    },
  );
  assert.equal(panggil(), 1);
});

test("text: 503 → PROVIDER_UNAVAILABLE, di-retry sesuai maxRetries", async () => {
  const { impl, panggil } = buatMockFetch(async () => responsJson({ error: { message: "overloaded" } }, 503));
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 2 });

  await assert.rejects(
    () => provider.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "PROVIDER_UNAVAILABLE");
      return true;
    },
  );
  assert.equal(panggil(), 3); // 1 percobaan awal + 2 retry
});

test("text: diblokir safety → UNSAFE_RESPONSE dengan alasan blok", async () => {
  const { impl } = buatMockFetch(async () =>
    responsJson({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }], promptFeedback: { blockReason: "PROBABILITY" } }),
  );
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 2 });

  await assert.rejects(
    () => provider.generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "UNSAFE_RESPONSE");
      assert.equal(err.kodeMekanis, "PROBABILITY");
      return true;
    },
  );
});

test("text: kandidat kosong → UNSAFE_RESPONSE (kodeMekanis 'kandidat kosong')", async () => {
  const { impl } = buatMockFetch(async () => responsJson({ candidates: [] }));
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 2 });

  await assert.rejects(
    () => provider.generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "UNSAFE_RESPONSE");
      assert.equal(err.kodeMekanis, "kandidat kosong");
      return true;
    },
  );
});

// ===== GeminiImageProvider =====

const dataGambarInline = {
  candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAA=" } }] } }],
};

test("image: inline image → metadata JSON (uri asset://, status NEEDS_REVIEW); binary di-handoff via bytesBase64 untuk persist durable", async () => {
  let promptTangkap = "";
  const { impl } = buatMockFetch(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    promptTangkap = body.contents[0].parts[0].text;
    return responsJson(dataGambarInline);
  });

  const provider = new GeminiImageProvider({ apiKey: "kunci-tes", model: "model-gambar", fetchImpl: impl });
  const res = await provider.generateImage({
    promptType: "visual_prompt",
    context: { caseId: "CASE-1", sceneId: "SCENE_01", plan: { planId: "PLAN-01" }, prompt: "Ruang rawat berkabut, senja." },
  });

  const meta = JSON.parse(res.output) as Record<string, unknown>;
  assert.equal(meta.assetId, "ASSET-PLAN-01");
  assert.equal(meta.uri, "asset://gemini/model-gambar/CASE-1/SCENE_01/PLAN-01");
  assert.equal(meta.status, "NEEDS_REVIEW");
  assert.equal(meta.format, "image/png");
  assert.ok((meta.sizeBytes as number) > 0);
  assert.ok(Array.isArray(meta.verifyNotes));
  assert.equal(promptTangkap, "Ruang rawat berkabut, senja.");
  assert.deepEqual(res.warnings, []);
  // Binary TIDAK bocor ke Firestore: provider menyerahkan bytesBase64 sebagai
  // handoff transient ke `hasilkanAsetGambar` agar di-persist ke OBJECT STORAGE.
  // Yang masuk Firestore hanyalah metadata/ref (uri + metadata), bukan binary.
  // (Lihat hasilkanAsetGambar: bytesBase64 → penyimpanan.simpan → AsetVisual metadata.)
  assert.equal(meta.bytesBase64, "iVBORw0KGgoAAA=");
  assert.ok((meta.sizeBytes as number) > 0);
});

test("image: tanpa inline data → UNSAFE_RESPONSE", async () => {
  const { impl } = buatMockFetch(async () => responsJson({ candidates: [{ content: { parts: [{ text: "tidak ada gambar" }] } }] }));
  const provider = new GeminiImageProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 1 });

  await assert.rejects(
    () => provider.generateImage({ promptType: "visual_prompt", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "UNSAFE_RESPONSE");
      return true;
    },
  );
});

test("text: case_generation + skemaKandidat di context → prompt memuat Skema wajib + contoh", async () => {
  let bodyTangkap: Record<string, unknown> = {};
  const { impl } = buatMockFetch(async (_url, init) => {
    bodyTangkap = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return responsJson({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  });
  const provider = new GeminiTextProvider({ apiKey: "k", model: "m", fetchImpl: impl, maxRetries: 0 });
  await provider.generateText({
    promptType: "case_generation",
    context: { seed: { genre: "x" }, skemaKandidat: "SKEMA-WAJIB-timelineEvents", contohKandidat: "{\"caseId\":\"C\"}" },
  });
  const contents = (bodyTangkap["contents"] ?? []) as Array<{ parts?: Array<{ text?: string }> }>;
  const teks = contents[0]?.parts?.[0]?.text ?? "";
  assert.ok(teks.includes("Skema wajib:"));
  assert.ok(teks.includes("SKEMA-WAJIB-timelineEvents"));
  assert.ok(teks.includes("Contoh JSON minimal"));
  assert.ok(!teks.includes("\\\"skemaKandidat\\\""));
});