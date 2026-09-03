import { KesalahanKonfigurasi } from "../fondasi/eror.js";

/**
 * Konfigurasi AI terpusat â€” dibaca dari environment, konsisten dengan
 * konvensi `src/konfigurasi/lingkungan.ts`. Provider/model TIDAK di-hardcode di
 * domain; seluruhnya ditentukan config.
 *
 * Beta policy: AI Case Generator & Image Generator ENABLED (admin/offline);
 * AI Runtime Narrative & Assistant DISABLED by default.
 */
export type ProviderAiTerpilih = "gemini" | "fake" | "none";

export interface KonfigurasiAi {
  provider: ProviderAiTerpilih;
  textModel: string;
  imageModel: string;
  caseGenerationEnabled: boolean;
  runtimeNarrativeEnabled: boolean;
  assistantEnabled: boolean;
  geminiApiKey: string | undefined;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  maxGenerationAttempts: number;
  /** Provider teks siap dipakai (provider=gemini + api key). */
  readonly textReady: boolean;
  /** Provider gambar siap dipakai (provider=gemini + api key + model gambar). */
  readonly imageReady: boolean;
}

function bacaBoolean(value: string | undefined, def: boolean): boolean {
  if (value === undefined || value === "") return def;
  return value.toLowerCase() === "true" || value === "1";
}

export function bacaKonfigurasiAi(env: Record<string, string | undefined>): KonfigurasiAi {
  const providerRaw = (env.AI_PROVIDER ?? "none").toLowerCase();
  const provider: ProviderAiTerpilih = providerRaw === "gemini" ? "gemini" : providerRaw === "fake" ? "fake" : "none";

  const geminiApiKey = env.GEMINI_API_KEY ?? "";
  const apiKeyValid = geminiApiKey.trim().length > 0;

  const textModel = (env.AI_TEXT_MODEL ?? /* model teks default Gemini */ "gemini-flash-latest").trim();
  const imageModel = (env.AI_IMAGE_MODEL ?? /* model gambar Gemini (Nano Banana) */ "gemini-3.1-flash-image").trim();

  // Honesty: jika provider=gemini tetapi kunci tidak valid (textReady=false),
  // case generation tidak bisa berjalan → paksa false apa pun flag env.
  const caseGenerationEnabled = provider === "gemini" && apiKeyValid
    ? bacaBoolean(env.AI_CASE_GENERATION_ENABLED, true) // ENABLED beta (admin/offline)
    : false;

  const runtimeNarrativeEnabled = bacaBoolean(env.AI_RUNTIME_NARRATIVE_ENABLED, false); // DISABLED default
  const assistantEnabled = bacaBoolean(env.AI_ASSISTANT_ENABLED, false); // DISABLED default

  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? "15000");
  const maxRetries = Number(env.AI_MAX_RETRIES ?? "2");
  const maxOutputTokens = Number(env.AI_MAX_OUTPUT_TOKENS ?? "2400");
  const maxGenerationAttempts = Number(env.AI_MAX_GENERATION_ATTEMPTS ?? "3");

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new KesalahanKonfigurasi("AI_TIMEOUT_MS tidak valid (harus > 0).");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new KesalahanKonfigurasi("AI_MAX_RETRIES tidak valid (0..5).");
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens > 100_000) {
    throw new KesalahanKonfigurasi("AI_MAX_OUTPUT_TOKENS di luar batas (0..100000).");
  }
  if (!Number.isInteger(maxGenerationAttempts) || maxGenerationAttempts <= 0 || maxGenerationAttempts > 100) {
    throw new KesalahanKonfigurasi("AI_MAX_GENERATION_ATTEMPTS di luar batas (1..100).");
  }

  return {
    provider,
    textModel,
    imageModel,
    caseGenerationEnabled,
    runtimeNarrativeEnabled,
    assistantEnabled,
    geminiApiKey: apiKeyValid ? geminiApiKey : undefined,
    timeoutMs,
    maxRetries,
    maxOutputTokens,
    maxGenerationAttempts,
    get textReady(): boolean { return provider === "gemini" && apiKeyValid && textModel.length > 0; },
    get imageReady(): boolean { return provider === "gemini" && apiKeyValid && imageModel.length > 0; },
  };
}