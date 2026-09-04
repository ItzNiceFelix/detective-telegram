#!/usr/bin/env node
/** xKIRO LIVE SMOKE — real credentials.
 * Batas: TEPAT SATU text request (non-streaming). TIDAK menjalankan case generation.
 * Langkah:
 *   1. Credential gate (XKIRO_API_KEY wajib; nilainya TIDAK pernah dicetak).
 *   2. GET /v1/models — daftar hanya ID model dengan access_tier === "free".
 *   3. GET /v1/usage — opsional (gagal tidak menggagalkan smoke).
 *   4. SATU text request via XkiroTextProvider (maxRetries=0 kecuali
 *      XKIRO_SMOKE_MAX_RETRIES diset eksplisit) — laporkan provider/model/http/
 *      latency/token usage. Tanpa prompt penuh, tanpa response penuh.
 * Jalankan: npx tsx tests/smoke-xkiro-live.ts
 */
import { readFileSync } from "node:fs";
import { XkiroTextProvider } from "../src/infrastructure/adapters/ai/xkiro-text.js";

function muatEnvFile() {
  try {
    for (const baris of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const l = baris.trim();
      if (!l || l.startsWith("#")) continue;
      const eq = l.indexOf("=");
      if (eq <= 0) continue;
      const k = l.slice(0, eq).trim();
      const v = l.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch {
    // .env opsional; env mungkin sudah di-set (Vercel/shell).
  }
}

function env(k: string): string {
  return (process.env[k] ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Meta { status: number; latencyMs: number; }

function pencatatFetch() {
  const meta: Meta = { status: -1, latencyMs: -1 };
  const impl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const t0 = Date.now();
    const res = await fetch(input, init);
    meta.latencyMs = Date.now() - t0;
    meta.status = res.status;
    return res;
  }) as unknown as typeof fetch;
  return { meta, impl };
}

async function main(): Promise<void> {
  muatEnvFile();
  console.log("🧪 xKIRO LIVE SMOKE (real credentials; tepat 1 text request)");

  const apiKey = env("XKIRO_API_KEY");
  const apiBase = (env("XKIRO_API_BASE") || "https://api.xkiro.com/v1").replace(/\/+$/, "");
  if (!apiKey) {
    console.error("GAGAL: XKIRO_API_KEY kosong (env atau .env). Henti — tanpa key, tidak ada panggilan live.");
    process.exit(1);
  }
  console.log(`[INFO] credential gate: XKIRO_API_KEY=terisi (nilai tidak ditampilkan)`);
  console.log(`[INFO] apiBase=${apiBase}`);

  // ---- 1) GET /v1/models — hanya ID model access_tier === "free". ----
  let modelFree: string[] = [];
  let modelPilih = env("XKIRO_SMOKE_MODEL");
  {
    const { meta, impl } = pencatatFetch();
    try {
      const res = await impl(`${apiBase}/models`, {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      const data: unknown = await res.json().catch(() => null);
      const daftar = isRecord(data) && Array.isArray(data.data) ? data.data : [];
      modelFree = daftar
        .filter((item): item is Record<string, unknown> => isRecord(item) && item.access_tier === "free")
        .map((item) => (typeof item.id === "string" ? item.id : ""))
        .filter((id) => id.length > 0);
      console.log(`[INFO] /v1/models http=${meta.status} latency=${meta.latencyMs}ms`);
      console.log(`[INFO] model access_tier=free (${modelFree.length}): ${modelFree.length > 0 ? modelFree.join(", ") : "(tidak ada)"}`);
      if (!modelPilih && modelFree.length > 0) modelPilih = modelFree[0] ?? "";
    } catch (error) {
      console.log(`[WARN] /v1/models gagal (opsional untuk langkah berikut): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---- 2) GET /v1/usage — opsional. ----
  {
    const { meta, impl } = pencatatFetch();
    try {
      const res = await impl(`${apiBase}/usage`, {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      const data: unknown = await res.json().catch(() => null);
      const ringkasan = isRecord(data)
        ? Object.keys(data).map((k) => `${k}=${String((data as Record<string, unknown>)[k]).slice(0, 40)}`)
        : [];
      console.log(`[INFO] /v1/usage http=${meta.status} latency=${meta.latencyMs}ms fields=[${ringkasan.join(" | ")}]`);
    } catch (error) {
      console.log(`[WARN] /v1/usage tidak tersedia (opsional): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!modelPilih) {
    console.error("GAGAL: tidak ada model untuk smoke (set XKIRO_SMOKE_MODEL atau /v1/models tidak mengembalikan model free).");
    process.exit(1);
  }

  // ---- 3) TEPAT SATU text request (non-streaming, tanpa retry kecuali diset). ----
  const maxRetries = env("XKIRO_SMOKE_MAX_RETRIES") === "" ? 0 : Number(env("XKIRO_SMOKE_MAX_RETRIES"));
  const { meta, impl } = pencatatFetch();
  const provider = new XkiroTextProvider({ apiKey, model: modelPilih, apiBase, fetchImpl: impl, timeoutMs: 30_000, maxRetries });
  const mulai = Date.now();
  let status = "FAIL";
  try {
    const res = await provider.generateText({
      promptType: "hint",
      context: { message: "Say one short non-sensitive greeting line." },
      maxTokens: 120,
    });
    const usage = res.usage ?? {};
    console.log("[RESULT]");
    console.log(`  provider = xkiro`);
    console.log(`  model    = ${modelPilih}`);
    console.log(`  http     = ${meta.status}`);
    console.log(`  latency  = ${Date.now() - mulai}ms (total incl. fetch ${meta.latencyMs}ms)`);
    console.log(`  fetchCalls = ${meta.status > 0 ? "1 (maxRetries=" + maxRetries + ")" : "-"}`);
    console.log(`  token    = input=${usage.tokenInput ?? "null"} output=${usage.tokenOutput ?? "null"} total=${usage.tokenTotal ?? "null"}`);
    console.log(`  output   = nonEmpty=${res.output.length > 0} length=${res.output.length} (isi TIDAK dicetak)`);
    status = meta.status >= 200 && meta.status < 300 && res.output.length > 0 ? "PASS" : "FAIL";
  } catch (error) {
    console.log("[RESULT]");
    console.log(`  provider = xkiro`);
    console.log(`  model    = ${modelPilih}`);
    console.log(`  http     = ${meta.status}`);
    console.log(`  latency  = ${Date.now() - mulai}ms`);
    console.log(`  error    = ${error instanceof Error ? error.name : "unknown"}: ${error instanceof Error ? error.message : String(error)}`);
    status = "FAIL";
  }

  console.log(`\nFinal verdict: XKIRO_SMOKE = ${status}`);
  process.exit(status === "PASS" ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("❌ FATAL — smoke gagal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
