import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";

import { RouterAi, TTL_KONFIGURASI_RUNTIME_MS, type DefaultRuntimeEnv } from "../../src/infrastructure/adapters/ai/router-ai.js";
import { RepositoriKonfigurasiAiFirestore } from "../../src/infrastructure/repositories/firestore/repositori-konfigurasi-ai.js";
import {
  gabungKonfigurasiRuntime,
  konfigurasiRuntimeDefault,
  validasiDanNormalisasiRuntime,
  type KonfigurasiRuntimeAi,
} from "../../src/ai/konfigurasi-runtime.js";
import { KesalahanKonfigurasi } from "../../src/fondasi/eror.js";
import { KesalahanProviderAi } from "../../src/ai/errors.js";
import { FirestorePalsu } from "../integration/fake-firestore.js";

const ENV_DEFAULT: DefaultRuntimeEnv = {
  provider: "none",
  textModel: "gemini-flash-latest",
  timeoutMs: 15000,
  maxRetries: 2,
  maxOutputTokens: 2400,
  textReady: false,
  imageReady: false,
  caseGenerationEnabled: false,
  runtimeNarrativeEnabled: false,
  assistantEnabled: false,
};

function cfgTeks(over: Partial<KonfigurasiRuntimeAi["text"]> = {}): KonfigurasiRuntimeAi {
  const d = konfigurasiRuntimeDefault();
  d.text = {
    enabled: true,
    provider: "gemini",
    model: "model-A",
    baseUrl: undefined,
    maxOutputTokens: 2400,
    maxRetries: 0,
    timeoutMs: 5000,
    ...over,
  };
  return d;
}

function cfgLengkap(): KonfigurasiRuntimeAi {
  const c = cfgTeks();
  c.caseGeneration.enabled = true;
  return c;
}

/** Sumber programmable: nilai / error / delay + counter fetch. */
class SumberUji {
  calls = 0;
  nilai: KonfigurasiRuntimeAi | null | "ERROR";
  delayMs: number;
  gate: (() => void)[] = [];

  constructor(nilai: KonfigurasiRuntimeAi | null | "ERROR", delayMs = 0) {
    this.nilai = nilai;
    this.delayMs = delayMs;
  }

  async ambilKonfigurasi(): Promise<KonfigurasiRuntimeAi | null> {
    this.calls += 1;
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.nilai === "ERROR") throw new Error("firestore down");
    return this.nilai;
  }
}

function buatRouter(sumber: SumberUji, kunci: Record<string, string> = { geminiApiKey: "KUNCI-UJI" }, ttlMs = 60_000, fetchImpl?: typeof fetch) {
  return new RouterAi({
    sumber,
    defaultsEnv: ENV_DEFAULT,
    kunci,
    ...(fetchImpl ? { fetchImpl } : {}),
    ttlMs,
  });
}

interface FetchTangkap {
  urls: string[];
  payloads: Array<Record<string, unknown>>;
}

function buatMockFetchGemini(tangkap: FetchTangkap, countTokens?: number): typeof fetch {
  type InputFetch = Parameters<typeof fetch>[0];
  return (async (input: InputFetch, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    tangkap.urls.push(url);
    tangkap.payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (url.includes(":countTokens")) {
      return new Response(JSON.stringify({ totalTokens: countTokens ?? 10 }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hasil-ok" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6, totalTokenCount: 11 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

const tidur = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ===== 1. config loaded from Firestore =====

test("1. config dimuat dari Firestore ai_runtime_config/production", async () => {
  const fake = new FirestorePalsu();
  await fake.refDokumen("ai_runtime_config", "production").set({
    text: { enabled: true, provider: "gemini", model: "model-A", maxOutputTokens: 1000, maxRetries: 1, timeoutMs: 8000 },
    runtimeNarrative: { enabled: false },
    assistant: { enabled: false },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: true },
  });
  const repo = new RepositoriKonfigurasiAiFirestore(fake as unknown as Firestore);
  const cfg = await repo.ambilKonfigurasi();
  assert.ok(cfg);
  assert.equal(cfg.text.provider, "gemini");
  assert.equal(cfg.text.model, "model-A");
  assert.equal(cfg.text.maxOutputTokens, 1000);
  assert.equal(cfg.caseGeneration.enabled, true);
});

// ===== 2. default config =====

test("2. dokumen hilang → null → default aman (semua fitur mati)", async () => {
  const fake = new FirestorePalsu();
  const repo = new RepositoriKonfigurasiAiFirestore(fake as unknown as Firestore);
  assert.equal(await repo.ambilKonfigurasi(), null);

  const d = konfigurasiRuntimeDefault();
  assert.equal(d.text.enabled, false);
  assert.equal(d.caseGeneration.enabled, false);
  assert.equal(d.runtimeNarrative.enabled, false);
  assert.equal(d.assistant.enabled, false);
  assert.equal(d.image.enabled, false);
  assert.equal(d.image.mode, "HUMAN_IN_LOOP");
});

// ===== 3. Firestore config overrides default =====

test("3. Firestore meng-override default env", async () => {
  const dariFs = cfgLengkap();
  dariFs.text.model = "model-B";
  dariFs.text.timeoutMs = 9000;
  const efektif = gabungKonfigurasiRuntime(
    {
      provider: "gemini",
      textModel: "model-lama",
      imageModel: "",
      timeoutMs: 15000,
      maxRetries: 2,
      maxOutputTokens: 2400,
      textReady: true,
      imageReady: false,
      caseGenerationEnabled: true,
      runtimeNarrativeEnabled: false,
      assistantEnabled: false,
    },
    dariFs,
  );
  assert.equal(efektif.text.model, "model-B");
  assert.equal(efektif.text.timeoutMs, 9000);

  const sumber = new SumberUji(dariFs);
  const router = buatRouter(sumber);
  const cfg = await router.ambilKonfigurasiEfektif();
  assert.equal(cfg.text.model, "model-B");
});

// ===== 4. TTL cache =====

test("4. TTL cache: baca dalam TTL tanpa fetch ulang; kedaluwarsa → refetch", async () => {
  const sumber = new SumberUji(cfgLengkap());
  const router = buatRouter(sumber, {}, 40);
  await router.ambilKonfigurasiEfektif();
  await router.ambilKonfigurasiEfektif();
  assert.equal(sumber.calls, 1);
  await tidur(55);
  await router.ambilKonfigurasiEfektif();
  assert.equal(sumber.calls, 2);
  assert.ok(TTL_KONFIGURASI_RUNTIME_MS >= 30_000 && TTL_KONFIGURASI_RUNTIME_MS <= 60_000);
});

// ===== 5. provider selection =====

test("5. provider=gemini → request ke endpoint Gemini", async () => {
  const tangkap: FetchTangkap = { urls: [], payloads: [] };
  const sumber = new SumberUji(cfgLengkap());
  const router = buatRouter(sumber, { geminiApiKey: "K" }, 60_000, buatMockFetchGemini(tangkap));
  const res = await router.generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, "hasil-ok");
  assert.equal(tangkap.urls.length, 1);
  assert.ok(tangkap.urls[0]?.includes("models/model-A:generateContent"));
});

// ===== 6. model selection (A → B tanpa restart) =====

test("6. ganti model-A → model-B di Firestore berlaku di request berikut tanpa restart", async () => {
  const tangkap: FetchTangkap = { urls: [], payloads: [] };
  const sumber = new SumberUji(cfgLengkap());
  const router = buatRouter(sumber, { geminiApiKey: "K" }, 30, buatMockFetchGemini(tangkap));
  await router.generateText({ promptType: "case_generation", context: {} });
  assert.ok(tangkap.urls[0]?.includes("models/model-A:generateContent"));

  const baru = cfgLengkap();
  baru.text.model = "model-B";
  sumber.nilai = baru;
  await tidur(45);
  await router.generateText({ promptType: "case_generation", context: {} });
  assert.ok(tangkap.urls[1]?.includes("models/model-B:generateContent"));
  assert.equal(sumber.calls, 2);
});

// ===== 7. token limits =====

test("7. maxOutputTokens Firestore di-cap tanpa silent override; maxInputTokens berlebih ditolak", async () => {
  const tangkap: FetchTangkap = { urls: [], payloads: [] };
  const cfg = cfgLengkap();
  cfg.text.maxOutputTokens = 100;
  const sumber = new SumberUji(cfg);
  const router = buatRouter(sumber, { geminiApiKey: "K" }, 60_000, buatMockFetchGemini(tangkap, 10));
  await router.generateText({ promptType: "case_generation", context: {}, maxTokens: 5000 });
  const genCfg = (tangkap.payloads[0]?.["generationConfig"] ?? {}) as Record<string, unknown>;
  assert.equal(genCfg["maxOutputTokens"], 100);

  const cfgKecil = cfgLengkap();
  cfgKecil.text.maxInputTokens = 1;
  const sumber2 = new SumberUji(cfgKecil);
  const router2 = buatRouter(sumber2, { geminiApiKey: "K" }, 60_000, buatMockFetchGemini({ urls: [], payloads: [] }, 50));
  await assert.rejects(
    () => router2.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "INVALID_RESPONSE");
      return true;
    },
  );
});

// ===== 8. timeout configuration =====

test("8. timeoutMs Firestore dipakai; timeout → error AI terstruktur TIMEOUT", async () => {
  const cfg = cfgLengkap();
  cfg.text.timeoutMs = 1000;
  const sumber = new SumberUji(cfg);
  type InputFetch = Parameters<typeof fetch>[0];
  const gantung: typeof fetch = ((input: InputFetch, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("operation timed out");
        e.name = "TimeoutError";
        reject(e);
      });
    })) as typeof fetch;
  const router = buatRouter(sumber, { geminiApiKey: "K" }, 60_000, gantung);
  const efektif = await router.ambilKonfigurasiEfektif();
  assert.equal(efektif.text.timeoutMs, 1000);
  await assert.rejects(
    () => router.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.equal(err.kategori, "TIMEOUT");
      return true;
    },
  );
});

// ===== 9. disabled feature blocks generation =====

test("9. fitur mati → DISABLED (caseGeneration off; text off)", async () => {
  const mati = cfgTeks({ enabled: true });
  const sumber = new SumberUji(mati);
  const router = buatRouter(sumber, { geminiApiKey: "K" });
  await assert.rejects(
    () => router.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "DISABLED",
  );

  const teksMati = cfgLengkap();
  teksMati.text.enabled = false;
  const router2 = buatRouter(new SumberUji(teksMati), { geminiApiKey: "K" });
  await assert.rejects(
    () => router2.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "DISABLED",
  );
});

// ===== 10. text enabled while image disabled =====

test("10. teks aktif + image mati: case_generation jalan; image gate menolak", async () => {
  const tangkap: FetchTangkap = { urls: [], payloads: [] };
  const cfg = cfgLengkap();
  cfg.image.enabled = false;
  const sumber = new SumberUji(cfg);
  const router = buatRouter(sumber, { geminiApiKey: "K" }, 60_000, buatMockFetchGemini(tangkap));
  const res = await router.generateText({ promptType: "case_generation", context: {} });
  assert.equal(res.output, "hasil-ok");
  await assert.rejects(
    () => router.pastikanAktif("image"),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "DISABLED",
  );
  await router.pastikanAktif("caseGeneration");
});

// ===== 11. no provider key leakage =====

test("11. kunci provider tidak bocor: config/repo/error bersih dari secret", async () => {
  const fake = new FirestorePalsu();
  await fake.refDokumen("ai_runtime_config", "production").set({
    text: { enabled: true, provider: "gemini", model: "m", geminiApiKey: "BOCOR-JANGAN" },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: true },
  });
  const repo = new RepositoriKonfigurasiAiFirestore(fake as unknown as Firestore);
  await assert.rejects(() => repo.ambilKonfigurasi(), (err: unknown) => err instanceof KesalahanKonfigurasi);

  const sumber = new SumberUji(cfgLengkap());
  const router = buatRouter(sumber, { geminiApiKey: "KUNCI-RAHASIA-XYZ" });
  const cfg = await router.ambilKonfigurasiEfektif();
  assert.ok(!JSON.stringify(cfg).includes("KUNCI-RAHASIA-XYZ"));
  await assert.rejects(
    () => buatRouter(new SumberUji(cfgLengkap()), {}).generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanProviderAi);
      assert.ok(!String((err as Error).message).includes("KUNCI-RAHASIA-XYZ"));
      return true;
    },
  );
});

// ===== 12. invalid config rejected safely =====

test("12. config invalid → ditolak aman; router fallback default tanpa crash", async () => {
  assert.throws(() => validasiDanNormalisasiRuntime({ text: { maxOutputTokens: -5 } }), KesalahanKonfigurasi);
  assert.throws(() => validasiDanNormalisasiRuntime("bukan-object"), KesalahanKonfigurasi);
  assert.throws(
    () => validasiDanNormalisasiRuntime({ text: { provider: "gemini" }, image: { mode: "AUTO" } }),
    KesalahanKonfigurasi,
  );

  const router = buatRouter(new SumberUji("ERROR"), {});
  const cfg = await router.ambilKonfigurasiEfektif();
  assert.equal(cfg.text.enabled, false);
  await assert.rejects(
    () => router.generateText({ promptType: "case_generation", context: {} }),
    (err: unknown) => err instanceof KesalahanProviderAi && err.kategori === "DISABLED",
  );
});

// ===== 13. concurrent config reads safe =====

test("13. concurrent reads → singleflight (1 fetch untuk N pembaca)", async () => {
  const sumber = new SumberUji(cfgLengkap(), 30);
  const router = buatRouter(sumber);
  const hasil = await Promise.all(Array.from({ length: 10 }, () => router.ambilKonfigurasiEfektif()));
  assert.equal(sumber.calls, 1);
  for (const cfg of hasil) {
    assert.equal(cfg.text.model, "model-A");
  }
});

test("14. migrasi: env gemini+key tanpa Firestore → behavior lama utuh (model/flag/budget)", async () => {
  const router = new RouterAi({
    sumber: new SumberUji(null),
    defaultsEnv: {
      provider: "gemini",
      textModel: "gemini-flash-latest",
      timeoutMs: 15000,
      maxRetries: 2,
      maxOutputTokens: 2400,
      textReady: true,
      imageReady: true,
      caseGenerationEnabled: true,
      runtimeNarrativeEnabled: false,
      assistantEnabled: false,
    },
    kunci: { geminiApiKey: "K" },
  });
  const cfg = await router.ambilKonfigurasiEfektif();
  assert.equal(cfg.text.provider, "gemini");
  assert.equal(cfg.text.model, "gemini-flash-latest");
  assert.equal(cfg.text.enabled, true);
  assert.equal(cfg.caseGeneration.enabled, true);
  assert.equal(cfg.runtimeNarrative.enabled, false);
  assert.equal(cfg.text.timeoutMs, 15000);
  assert.equal(cfg.text.maxOutputTokens, 2400);
  await router.pastikanAktif("caseGeneration");
});
