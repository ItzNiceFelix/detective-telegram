import { KesalahanKonfigurasi } from "../fondasi/eror.js";

export interface VariabelLingkungan {
  NODE_ENV: "development" | "test" | "production";
  VERCEL_FUNCTION_BUDGET?: string | undefined;
  TARGET_FUNCTION_COUNT?: string | undefined;
  MAX_ACTIVE_PLAYERS?: string | undefined;
  DEFAULT_GROUP_SESSION_LIMIT?: string | undefined;
  TELEGRAM_WEBHOOK_SECRET?: string | undefined;
  AI_ENABLED?: string | undefined;
  // AI integration v1 (docs/AI-PRODUCTION-IMPLEMENTATION.md)
  AI_PROVIDER?: string | undefined;
  AI_TEXT_MODEL?: string | undefined;
  AI_IMAGE_MODEL?: string | undefined;
  AI_CASE_GENERATION_ENABLED?: string | undefined;
  AI_RUNTIME_NARRATIVE_ENABLED?: string | undefined;
  AI_ASSISTANT_ENABLED?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  FIREBASE_STORAGE_BUCKET?: string | undefined;
  AI_TIMEOUT_MS?: string | undefined;
  AI_MAX_RETRIES?: string | undefined;
  AI_MAX_OUTPUT_TOKENS?: string | undefined;
  AI_MAX_GENERATION_ATTEMPTS?: string | undefined;
}

export function bacaVariabelLingkungan(env: Record<string, string | undefined>): VariabelLingkungan {
  return {
    NODE_ENV: (env.NODE_ENV ?? "development") as "development" | "test" | "production",
    VERCEL_FUNCTION_BUDGET: env.VERCEL_FUNCTION_BUDGET,
    TARGET_FUNCTION_COUNT: env.TARGET_FUNCTION_COUNT,
    MAX_ACTIVE_PLAYERS: env.MAX_ACTIVE_PLAYERS,
    DEFAULT_GROUP_SESSION_LIMIT: env.DEFAULT_GROUP_SESSION_LIMIT,
    TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
    AI_ENABLED: env.AI_ENABLED,
    AI_PROVIDER: env.AI_PROVIDER,
    AI_TEXT_MODEL: env.AI_TEXT_MODEL,
    AI_IMAGE_MODEL: env.AI_IMAGE_MODEL,
    AI_CASE_GENERATION_ENABLED: env.AI_CASE_GENERATION_ENABLED,
    AI_RUNTIME_NARRATIVE_ENABLED: env.AI_RUNTIME_NARRATIVE_ENABLED,
    AI_ASSISTANT_ENABLED: env.AI_ASSISTANT_ENABLED,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    FIREBASE_STORAGE_BUCKET: env.FIREBASE_STORAGE_BUCKET,
    AI_TIMEOUT_MS: env.AI_TIMEOUT_MS,
    AI_MAX_RETRIES: env.AI_MAX_RETRIES,
    AI_MAX_OUTPUT_TOKENS: env.AI_MAX_OUTPUT_TOKENS,
    AI_MAX_GENERATION_ATTEMPTS: env.AI_MAX_GENERATION_ATTEMPTS,
  };
}

export function validasiVariabelLingkungan(env: Record<string, string | undefined>): VariabelLingkungan {
  const hasil = bacaVariabelLingkungan(env);

  if (!["development", "test", "production"].includes(hasil.NODE_ENV)) {
    throw new KesalahanKonfigurasi("NODE_ENV tidak valid.");
  }

  if (hasil.TELEGRAM_WEBHOOK_SECRET !== undefined && hasil.TELEGRAM_WEBHOOK_SECRET.length === 0) {
    throw new KesalahanKonfigurasi("TELEGRAM_WEBHOOK_SECRET tidak boleh kosong jika diset.");
  }

  return hasil;
}
