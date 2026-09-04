import test from "node:test";
import assert from "node:assert/strict";

import { XkiroTextProvider } from "../../src/infrastructure/adapters/ai/xkiro-text.js";
import {
  klasifikasikanStatusXkiro,
  uraiKontenXkiro,
  uraiTotalTokensXkiro,
  uraiUsageXkiro,
} from "../../src/infrastructure/adapters/ai/xkiro-net.js";
import { RouterAi, type DefaultRuntimeEnv } from "../../src/infrastructure/adapters/ai/router-ai.js";
import { validasiDanNormalisasiRuntime, type KonfigurasiRuntimeAi } from "../../src/ai/konfigurasi-runtime.js";
import { KesalahanProviderAi } from "../../src/ai/errors.js";
import { KesalahanKonfigurasi } from "../../src/fondasi/eror.js";
import type { CatatanTelemetriAi } from "../../src/infrastructure/adapters/ai/telemetri-ai.js";

const KUNCI = "XKIRO-KUNCI-RAHASIA-TES";

function responsJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function responsTeks(isi: string, status = 200): Response {
  return new Response(isi, { status });
}

interface TangkapFetch {
  urls: string[];
  headers: Array<Record<string, string>>;
  bodies: Array<Record<string, unknown>>;
  calls: number;
}

function buatMockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  tangkap?: TangkapFetch,
): typeof fetch {
  const t: TangkapFetch = tangkap ?? { urls: [], headers: [], bodies: [], calls: 0 };
  type InputFetch = Parameters<typeof fetch>[0];
  return (async (input: InputFetch, init?: RequestInit) => {
    t.calls += 1;
    const url = typeof input === "string" ? input : input.toString();
    t.urls.push(url);
    t.headers.push((init?.headers ?? {}) as Record<string, string>);
    if (init?.body) t.bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return handler(url, init);
  }) as typeof fetch;
}

function dataChatOk(konten: string, usage?: Record<string, unknown>): unknown {
  return {
    id: "chatcmpl-1",
    choices: [{ message: { role: "assistant", content: konten }, finish_reason: "stop" }],
    ...(usage ? { usage } : {}),
  };
}

function providerUji(over: Partial<ConstructorParameters<typeof XkiroTextProvider>[0]> = {}): XkiroTextProvider {
  return new XkiroTextProvider({
    apiKey: KUNCI,
    model: "xkiro-tes-1",
    maxRetries: 0,
    maxOutputTokens: 1000,
    ...over,
  });
}

// ===== 1. normal 200 =====

test("1. xKiro normal 200 → ResponAi {output, warnings}", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("jawaban-akhir")));
  const res = await providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: { q: "sapa" } });
  assert.equal(res.output, "jawaban-akhir");
  assert.deepEqual(res.warnings, []);
});

// ===== 2. endpoint URL =====

test("2. endpoint URL: POST {base}/chat/completions (default api.xkiro.com/v1)", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("ok")), t);
  await providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: {} });
  assert.equal(t.urls[0], "https://api.xkiro.com/v1/chat/completions");

  const t2: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl2 = buatMockFetch(async () => responsJson(dataChatOk("ok")), t2);
  await providerUji({ fetchImpl: fetchImpl2, apiBase: "https://custom.xkiro.test/v1/" }).generateText({ promptType: "dialogue", context: {} });
  assert.equal(t2.urls[0], "https://custom.xkiro.test/v1/chat/completions");
});

// ===== 3. Authorization header without leaking key =====

test("3. Authorization: Bearer <key> dikirim; key tidak masuk body/telemetri", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const telemetri: CatatanTelemetriAi[] = [];
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("ok", { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 })), t);
  await providerUji({ fetchImpl, telemetri: (c) => telemetri.push(c) }).generateText({ promptType: "dialogue", context: { x: 1 } });
  assert.equal(t.headers[0]?.["authorization"], `Bearer ${KUNCI}`);
  assert.ok(!JSON.stringify(t.bodies[0]).includes(KUNCI));
  assert.ok(!JSON.stringify(telemetri).includes(KUNCI));
});

// ===== 4. model passed correctly =====

test("4. model dari konfigurasi masuk payload (bukan hardcode)", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("ok")), t);
  await providerUji({ fetchImpl, model: "model-dari-firestore" }).generateText({ promptType: "case_generation", context: {} });
  assert.equal(t.bodies[0]?.["model"], "model-dari-firestore");

  const kosong = providerUji({ fetchImpl, model: "  " });
  await assert.rejects(
    () => kosong.generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "MODEL_NOT_FOUND",
  );
});

// ===== 5. structured response parsing =====

test("5. structured content case_generation diteruskan apa adanya (strict pass-through, tanpa recovery)", async () => {
  const jsonKandidat = '{"caseId":"C1","caseBible":{"title":"X"}}';
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk(jsonKandidat)));
  const res = await providerUji({ fetchImpl }).generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, jsonKandidat);
  assert.doesNotThrow(() => JSON.parse(res.output));
});

// ===== 6. usage mapping =====

test("6. usage.prompt_tokens/completion_tokens/total_tokens → tokenInput/tokenOutput/tokenTotal", async () => {
  const fetchImpl = buatMockFetch(async () =>
    responsJson(dataChatOk("ok", { prompt_tokens: 120, completion_tokens: 340, total_tokens: 460 })),
  );
  const res = await providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: {} });
  assert.deepEqual(res.usage, { tokenInput: 120, tokenOutput: 340, tokenTotal: 460 });
});

// ===== 7. missing content =====

test("7. content hilang → INVALID_RESPONSE terstruktur", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson({ choices: [{ message: { role: "assistant" } }] }));
  await assert.rejects(
    () => providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "INVALID_RESPONSE");
      return true;
    },
  );
  const kosong = buatMockFetch(async () => responsJson({ choices: [] }));
  await assert.rejects(
    () => providerUji({ fetchImpl: kosong }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "INVALID_RESPONSE",
  );
});

// ===== 8. invalid JSON =====

test("8. output non-JSON diteruskan tanpa mutasi (validasi JSON milik domain)", async () => {
  const rusak = "bukan json sama sekali {";
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk(rusak)));
  const res = await providerUji({ fetchImpl }).generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, rusak);
  assert.throws(() => JSON.parse(res.output));
});

// ===== 9-16. error mapping & retry =====

test("9. 400 → INVALID_REQUEST (tanpa retry)", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "bad params" } }, 400), t);
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "INVALID_REQUEST");
      assert.equal(err.kodeMekanis, 400);
      return true;
    },
  );
  assert.equal(t.calls, 1);
});

test("10. 401 → AUTHENTICATION (tanpa retry)", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "invalid key" } }, 401), t);
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "AUTHENTICATION");
      return true;
    },
  );
  assert.equal(t.calls, 1);
});

test("11. 403 → PERMISSION_DENIED (tanpa retry)", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "forbidden" } }, 403));
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "PERMISSION_DENIED",
  );
});

test("12. 404 → MODEL_NOT_FOUND (tanpa retry)", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "model not found" } }, 404));
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "MODEL_NOT_FOUND",
  );
});

test("13. 429 → QUOTA_RATE_LIMIT", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "rate limited" } }, 429), t);
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "QUOTA_RATE_LIMIT");
      assert.equal(err.kodeMekanis, 429);
      return true;
    },
  );
  assert.equal(t.calls, 1);
});

test("14. 500 → PROVIDER_UNAVAILABLE", async () => {
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "boom" } }, 500));
  await assert.rejects(
    () => providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "PROVIDER_UNAVAILABLE",
  );
});

test("15. 502 → PROVIDER_UNAVAILABLE", async () => {
  const fetchImpl = buatMockFetch(async () => responsTeks("bad gateway", 502));
  await assert.rejects(
    () => providerUji({ fetchImpl }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "PROVIDER_UNAVAILABLE",
  );
});

test("16. 503 → di-retry sesuai maxRetries (bounded), lalu gagal", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "overloaded" } }, 503), t);
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 2 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "PROVIDER_UNAVAILABLE",
  );
  assert.equal(t.calls, 3); // 1 awal + 2 retry
});

// ===== 17. timeout =====

test("17. timeout → TIMEOUT terstruktur", async () => {
  type InputFetch = Parameters<typeof fetch>[0];
  const gantung: typeof fetch = ((input: InputFetch, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("operation timed out");
        e.name = "TimeoutError";
        reject(e);
      });
    })) as typeof fetch;
  await assert.rejects(
    () => providerUji({ fetchImpl: gantung, timeoutMs: 100 }).generateText({ promptType: "dialogue", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "TIMEOUT");
      return true;
    },
  );
});

// ===== 18. max token configuration =====

test("18. max_tokens di-cap config tanpa silent override", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("ok")), t);
  await providerUji({ fetchImpl, maxOutputTokens: 500 }).generateText({ promptType: "case_generation", context: {}, maxTokens: 99999 });
  assert.equal(t.bodies[0]?.["max_tokens"], 500);
  await providerUji({ fetchImpl, maxOutputTokens: 500 }).generateText({ promptType: "case_generation", context: {}, maxTokens: 120 });
  assert.equal(t.bodies[1]?.["max_tokens"], 120);
});

// ===== helper router =====

const ENV_ROUTER: DefaultRuntimeEnv = {
  provider: "none",
  textModel: "x",
  timeoutMs: 5000,
  maxRetries: 0,
  maxOutputTokens: 1000,
  textReady: true,
  imageReady: false,
  caseGenerationEnabled: true,
  runtimeNarrativeEnabled: false,
  assistantEnabled: false,
};

class SumberUji {
  nilai: KonfigurasiRuntimeAi | null;
  constructor(nilai: KonfigurasiRuntimeAi | null) {
    this.nilai = nilai;
  }
  async ambilKonfigurasi(): Promise<KonfigurasiRuntimeAi | null> {
    return this.nilai;
  }
}

function cfgXkiro(over: Partial<KonfigurasiRuntimeAi["text"]> = {}): KonfigurasiRuntimeAi {
  return {
    text: {
      enabled: true,
      provider: "xkiro",
      model: "xkiro-model-A",
      baseUrl: "https://api.xkiro.test/v1",
      maxOutputTokens: 1000,
      maxRetries: 0,
      timeoutMs: 5000,
      ...over,
    },
    runtimeNarrative: { enabled: false },
    assistant: { enabled: false },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: true },
  };
}

function cfgGemini(): KonfigurasiRuntimeAi {
  return {
    text: {
      enabled: true,
      provider: "gemini",
      model: "gemini-model-A",
      baseUrl: "https://api.gemini.test",
      maxOutputTokens: 1000,
      maxRetries: 0,
      timeoutMs: 5000,
    },
    runtimeNarrative: { enabled: false },
    assistant: { enabled: false },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: true },
  };
}

function routerXkiro(sumber: SumberUji, fetchImpl: typeof fetch): RouterAi {
  return new RouterAi({
    sumber,
    defaultsEnv: ENV_ROUTER,
    kunci: { geminiApiKey: "K-GEMINI", xkiroApiKey: KUNCI },
    fetchImpl,
    ttlMs: 60_000,
  });
}

// ===== 19. router selects xKiro =====

test("19. Router pilih xKiro: URL xKiro + model dari runtime config", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("dari-xkiro")), t);
  const router = routerXkiro(new SumberUji(cfgXkiro()), fetchImpl);
  const res = await router.generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, "dari-xkiro");
  assert.equal(t.urls[0], "https://api.xkiro.test/v1/chat/completions");
  assert.equal(t.headers[0]?.["authorization"], `Bearer ${KUNCI}`);
  assert.equal(t.bodies[0]?.["model"], "xkiro-model-A");
});

// ===== 20. router remains compatible with Gemini =====

test("20. Router tetap kompatibel Gemini: perilaku & endpoint Gemini tidak berubah", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () =>
    responsJson({
      candidates: [{ content: { parts: [{ text: "dari-gemini" }] } }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5, totalTokenCount: 9 },
    }),
    t,
  );
  const router = routerXkiro(new SumberUji(cfgGemini()), fetchImpl);
  const res = await router.generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, "dari-gemini");
  assert.equal(t.urls[0], "https://api.gemini.test/v1beta/models/gemini-model-A:generateContent");
  assert.equal(t.headers[0]?.["x-goog-api-key"], "K-GEMINI");
  assert.equal(res.usage?.tokenInput, 4);
  assert.equal(res.usage?.tokenOutput, 5);
  assert.equal(res.usage?.tokenTotal, 9);
});

// ===== 21. invalid provider =====

test("21. provider tak dikenal → dinormalisasi aman (none → DISABLED); bitdeer → config error jelas", async () => {
  const ternormalisasi = validasiDanNormalisasiRuntime({ text: { provider: "openai" } });
  assert.equal(ternormalisasi.text.provider, "none");
  const xkiroOk = validasiDanNormalisasiRuntime({ text: { provider: "xkiro" } });
  assert.equal(xkiroOk.text.provider, "xkiro");

  const router = routerXkiro(new SumberUji(cfgXkiro({ provider: "none" as never })), buatMockFetch(async () => responsJson(dataChatOk("x"))));
  await assert.rejects(
    () => router.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "DISABLED",
  );

  const routerBitdeer = routerXkiro(new SumberUji(cfgXkiro({ provider: "bitdeer" as never })), buatMockFetch(async () => responsJson(dataChatOk("x"))));
  await assert.rejects(
    () => routerBitdeer.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanKonfigurasi,
  );
});

// ===== 22. key not logged =====

test("22. telemetri xKiro tidak memuat key/authorization/prompt", async () => {
  const telemetri: CatatanTelemetriAi[] = [];
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson(dataChatOk("ok", { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 })), t);
  await providerUji({ fetchImpl, telemetri: (c) => telemetri.push(c) }).generateText({ promptType: "case_generation", context: { rahasia: "isi-prompt-tersembunyi" } });
  const serial = JSON.stringify(telemetri);
  assert.ok(!serial.includes(KUNCI));
  assert.ok(!serial.includes("authorization"));
  assert.ok(!serial.includes("isi-prompt-tersembunyi"));
  // prompt dikirim di body request (wajar) — yang dipastikan: TIDAK masuk log telemetri
  assert.ok(JSON.stringify(t.bodies[0]).includes("isi-prompt-tersembunyi"));
});

// ===== 23. no retry on 429 =====

test("23. 429 TIDAK di-retry (policy: hanya TIMEOUT/PROVIDER_UNAVAILABLE)", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async () => responsJson({ error: { message: "quota" } }, 429), t);
  await assert.rejects(
    () => providerUji({ fetchImpl, maxRetries: 3 }).generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "QUOTA_RATE_LIMIT",
  );
  assert.equal(t.calls, 1);
});

// ===== 24. no extra generation on fallback =====

test("24. fallback: 429 primer → TIDAK ada call fallback; 5xx → fallback tepat satu kali", async () => {
  const t: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl = buatMockFetch(async (url) => {
    if (url.includes("chat/completions")) return responsJson({ error: { message: "quota" } }, 429);
    return responsJson(dataChatOk("fallback-ok"));
  }, t);
  const cfg = cfgXkiro({ fallback: { provider: "gemini", model: "gemini-fallback" } });
  const router = routerXkiro(new SumberUji(cfg), fetchImpl);
  await assert.rejects(
    () => router.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "QUOTA_RATE_LIMIT",
  );
  const pemanggilanGemini = t.urls.filter((u) => u.includes(":generateContent")).length;
  assert.equal(pemanggilanGemini, 0);
  assert.equal(t.calls, 1);

  const t2: TangkapFetch = { urls: [], headers: [], bodies: [], calls: 0 };
  const fetchImpl2 = buatMockFetch(async (url) => {
    if (url.includes("chat/completions")) return responsJson({ error: { message: "boom" } }, 500);
    return responsJson({ candidates: [{ content: { parts: [{ text: "fallback-ok" }] } }] });
  }, t2);
  const router2 = routerXkiro(new SumberUji(cfg), fetchImpl2);
  const res = await router2.generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, "fallback-ok");
  assert.equal(t2.urls.filter((u) => u.includes(":generateContent")).length, 1);
  assert.equal(t2.urls.filter((u) => u.includes("chat/completions")).length, 1);
});

// ===== klasifikasi helper =====

test("klasifikasikanStatusXkiro: petakan semua kode sesuai kontrak", () => {
  assert.equal(klasifikasikanStatusXkiro(200), null);
  assert.equal(klasifikasikanStatusXkiro(400), "INVALID_REQUEST");
  assert.equal(klasifikasikanStatusXkiro(401), "AUTHENTICATION");
  assert.equal(klasifikasikanStatusXkiro(403), "PERMISSION_DENIED");
  assert.equal(klasifikasikanStatusXkiro(404), "MODEL_NOT_FOUND");
  assert.equal(klasifikasikanStatusXkiro(429), "QUOTA_RATE_LIMIT");
  assert.equal(klasifikasikanStatusXkiro(500), "PROVIDER_UNAVAILABLE");
  assert.equal(klasifikasikanStatusXkiro(502), "PROVIDER_UNAVAILABLE");
  assert.equal(klasifikasikanStatusXkiro(503), "PROVIDER_UNAVAILABLE");
});

test("uraiKontenXkiro / uraiUsageXkiro / uraiTotalTokensXkiro: parse aman", () => {
  assert.equal(uraiKontenXkiro({ choices: [{ message: { content: "a" } }] }), "a");
  assert.equal(uraiKontenXkiro({ choices: [] }), null);
  assert.equal(uraiKontenXkiro({}), null);
  assert.deepEqual(uraiUsageXkiro({ usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }), {
    tokenInput: 1,
    tokenOutput: 2,
    tokenTotal: 3,
  });
  assert.deepEqual(uraiUsageXkiro({}), {});
  assert.equal(uraiTotalTokensXkiro({ input_tokens: 77 }), 77);
  assert.equal(uraiTotalTokensXkiro({ total_tokens: 10 }), 10);
  assert.equal(uraiTotalTokensXkiro({}), null);
});
