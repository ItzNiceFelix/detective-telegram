import { KesalahanKonfigurasi } from "../fondasi/eror.js";

export interface VariabelLingkungan {
  NODE_ENV: "development" | "test" | "production";
  VERCEL_FUNCTION_BUDGET?: string | undefined;
  TARGET_FUNCTION_COUNT?: string | undefined;
  MAX_ACTIVE_PLAYERS?: string | undefined;
  DEFAULT_GROUP_SESSION_LIMIT?: string | undefined;
  TELEGRAM_WEBHOOK_SECRET?: string | undefined;
  AI_ENABLED?: string | undefined;
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
