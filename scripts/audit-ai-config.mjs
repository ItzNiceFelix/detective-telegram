/**
 * Audit runtime AI configuration locally (no secrets logged).
 * Reads process.env values used by src/ai/konfigurasi.ts → bacaKonfigurasiAi()
 * to compute caseGenerationEnabled, textReady, imageReady, runtime flags.
 */
function bacaBoolean(value, def) {
  if (value === undefined || value === "") return def;
  return value.toLowerCase() === "true" || value === "1";
}

const env = process.env;
const providerRaw = (env.AI_PROVIDER ?? "none").toLowerCase();
const provider = providerRaw === "gemini" ? "gemini" : providerRaw === "fake" ? "fake" : "none";

const geminiKey = env.GEMINI_API_KEY ?? "";
const apiKeyValid = geminiKey.trim().length > 0;
const keyLen = geminiKey.trim().length;

const textModel = (env.AI_TEXT_MODEL ?? "gemini-flash-latest").trim();
const imageModel = (env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image").trim();

const caseGenerationEnabled = provider === "gemini" && apiKeyValid
  ? bacaBoolean(env.AI_CASE_GENERATION_ENABLED, true)
  : false;
const runtimeNarrativeEnabled = bacaBoolean(env.AI_RUNTIME_NARRATIVE_ENABLED, false);
const assistantEnabled = bacaBoolean(env.AI_ASSISTANT_ENABLED, false);

const textReady = provider === "gemini" && apiKeyValid && textModel.length > 0;
const imageReady = provider === "gemini" && apiKeyValid && imageModel.length > 0;

const assetStorage = (env.ASSET_STORAGE_PROVIDER ?? "FIREBASE_STORAGE").trim().toUpperCase();
const vaultChatId = (env.TELEGRAM_ASSET_VAULT_CHAT_ID ?? "").trim();

const out = {
  "AI_PROVIDER (raw)": env.AI_PROVIDER ?? "(unset → defaults to none)",
  "AI_PROVIDER (normalized)": provider,
  "GEMINI_API_KEY present": apiKeyValid,
  "GEMINI_API_KEY length (chars)": keyLen,
  "GOOGLE_GEMINI_API_KEY present": Boolean((env.GOOGLE_GEMINI_API_KEY ?? "").trim().length > 0),
  "AI_TEXT_MODEL": env.AI_TEXT_MODEL ?? "(unset → default gemini-flash-latest)",
  "AI_IMAGE_MODEL": env.AI_IMAGE_MODEL ?? "(unset → default gemini-3.1-flash-image)",
  "AI_CASE_GENERATION_ENABLED": env.AI_CASE_GENERATION_ENABLED ?? "(unset → default true)",
  "AI_RUNTIME_NARRATIVE_ENABLED": env.AI_RUNTIME_NARRATIVE_ENABLED ?? "(unset → default false)",
  "AI_ASSISTANT_ENABLED": env.AI_ASSISTANT_ENABLED ?? "(unset → default false)",
  "--- computed runtime values ---": "",
  "caseGenerationEnabled": caseGenerationEnabled,
  "textReady (provider text available)": textReady,
  "imageReady (provider image available)": imageReady,
  "runtimeNarrativeEnabled": runtimeNarrativeEnabled,
  "assistantEnabled": assistantEnabled,
  "ASSET_STORAGE_PROVIDER (image storage strategy, NOT case gen)": assetStorage,
  "TELEGRAM_ASSET_VAULT_CHAT_ID present": vaultChatId.length > 0,
  "--- diagnosis ---": "",
  "ROOT_CAUSE_GUESS": !apiKeyValid
    ? "GEMINI_API_KEY empty/unset → caseGenerationEnabled forced to false"
    : provider !== "gemini"
      ? `AI_PROVIDER='${provider}' (not gemini) → caseGenerationEnabled forced to false`
      : env.AI_CASE_GENERATION_ENABLED && bacaBoolean(env.AI_CASE_GENERATION_ENABLED, true) === false
        ? "AI_CASE_GENERATION_ENABLED explicitly set to false/0"
        : "caseGenerationEnabled should be TRUE — investigate further",
};

console.log(JSON.stringify(out, null, 2));