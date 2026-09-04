import { KesalahanKonfigurasi } from "../fondasi/eror.js";
import type { ProviderAiTerpilih } from "./konfigurasi.js";

export type ProviderRuntimeTerpilih = "gemini" | "xkiro" | "bitdeer" | "none";

export type ModeImageRuntime = "HUMAN_IN_LOOP";

export interface FallbackRuntime {
  provider: ProviderRuntimeTerpilih;
  model: string;
}

export interface KonfigurasiTeksRuntime {
  enabled: boolean;
  provider: ProviderRuntimeTerpilih;
  model: string;
  baseUrl: string | undefined;
  /** Budget token input; `undefined` = tanpa enforcement input (default). */
  maxInputTokens?: number | undefined;
  maxOutputTokens: number;
  maxRetries: number;
  timeoutMs: number;
  fallback?: FallbackRuntime | undefined;
}

export interface KonfigurasiRuntimeNaratif {
  enabled: boolean;
}

export interface KonfigurasiAsistenRuntime {
  enabled: boolean;
}

export interface KonfigurasiImageRuntime {
  enabled: boolean;
  mode: ModeImageRuntime;
}

export interface KonfigurasiCaseGenerationRuntime {
  enabled: boolean;
}

export interface KonfigurasiRuntimeAi {
  text: KonfigurasiTeksRuntime;
  runtimeNarrative: KonfigurasiRuntimeNaratif;
  assistant: KonfigurasiAsistenRuntime;
  image: KonfigurasiImageRuntime;
  caseGeneration: KonfigurasiCaseGenerationRuntime;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
}

const KUNCI_KREDENSIAL_EKSAK = new Set([
  "apikey",
  "apisecret",
  "secret",
  "clientsecret",
  "password",
  "credential",
  "credentials",
  "privatekey",
  "token",
  "accesstoken",
  "authtoken",
  "refreshtoken",
  "idtoken",
]);

/**
 * Kredensial tidak boleh hidup di Firestore. Pencocokan hati-hati agar field
 * budget legit (`maxOutputTokens`, `maxInputTokens`, `totalTokens`) TIDAK
 * false-positive: substring `token` hanya ditolak bila bukan bentuk jamak
 * `tokens` (budget), sedangkan `secret`/`password`/`credential`/`apikey`
 * selalu ditolak sebagai substring.
 */
function adalahKunciKredensial(kunci: string): boolean {
  const normal = kunci.toLowerCase().replace(/[_-]+/g, "");
  if (KUNCI_KREDENSIAL_EKSAK.has(normal)) return true;
  if (normal.includes("secret") || normal.includes("password") || normal.includes("credential") || normal.includes("apikey")) {
    return true;
  }
  if (normal.includes("token") && !normal.includes("tokens")) return true;
  return false;
}

const PROVIDER_VALID: ReadonlySet<string> = new Set(["gemini", "xkiro", "bitdeer", "none"]);

export function konfigurasiRuntimeDefault(): KonfigurasiRuntimeAi {
  return {
    text: {
      enabled: false,
      provider: "none",
      model: "gemini-flash-latest",
      baseUrl: undefined,
      maxInputTokens: 8192,
      maxOutputTokens: 2400,
      maxRetries: 2,
      timeoutMs: 15000,
    },
    runtimeNarrative: { enabled: false },
    assistant: { enabled: false },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: false },
  };
}

function toProviderRuntime(value: unknown, fallback: ProviderRuntimeTerpilih = "none"): ProviderRuntimeTerpilih {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "xkiro" || v === "bitdeer") return v;
  if (v === "gemini") return "gemini";
  return "none";
}

function cekIntegerRange(nama: string, value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new KesalahanKonfigurasi(`${nama} tidak valid (${min}..${max}).`);
  }
  return n;
}

function cekNumberPositive(nama: string, value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new KesalahanKonfigurasi(`${nama} tidak valid (${min}..${max}).`);
  }
  return n;
}

function cekKunciTerlarang(obj: unknown, path: string): void {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (adalahKunciKredensial(k)) {
      throw new KesalahanKonfigurasi(`Field terlarang di ${path}: ${k} (kredensial tidak boleh di Firestore).`);
    }
    const v = (obj as Record<string, unknown>)[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      cekKunciTerlarang(v, `${path}.${k}`);
    }
  }
}

function bacaStringTrim(value: unknown, def: string): string {
  if (typeof value !== "string") return def;
  const t = value.trim();
  return t.length > 0 ? t : def;
}

export function validasiDanNormalisasiRuntime(raw: unknown): KonfigurasiRuntimeAi {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new KesalahanKonfigurasi("Konfigurasi runtime AI tidak valid (bukan object).");
  }
  cekKunciTerlarang(raw, "ai_runtime_config");
  const r = raw as Record<string, unknown>;

  const textRaw = (r.text ?? {}) as Record<string, unknown>;
  cekKunciTerlarang(textRaw, "text");

  const enabled = typeof textRaw.enabled === "boolean" ? textRaw.enabled : false;
  const provider = toProviderRuntime(textRaw.provider, "none");
  if (!PROVIDER_VALID.has(provider)) {
    throw new KesalahanKonfigurasi(`Provider tidak valid: ${String(textRaw.provider)}`);
  }
  const model = bacaStringTrim(textRaw.model, "gemini-flash-latest");
  const baseUrlRaw = typeof textRaw.baseUrl === "string" ? textRaw.baseUrl.trim() : "";
  const baseUrl = baseUrlRaw.length > 0 ? baseUrlRaw : undefined;
  if (baseUrl !== undefined) {
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocol");
    } catch {
      throw new KesalahanKonfigurasi("text.baseUrl tidak valid (harus URL http/https).");
    }
  }
  const maxInputTokens = textRaw.maxInputTokens === undefined || textRaw.maxInputTokens === null
    ? undefined
    : cekIntegerRange("text.maxInputTokens", textRaw.maxInputTokens, 1, 1_000_000);
  const maxOutputTokens = cekIntegerRange("text.maxOutputTokens", textRaw.maxOutputTokens ?? 2400, 1, 100_000);
  const maxRetries = cekIntegerRange("text.maxRetries", textRaw.maxRetries ?? 2, 0, 5);
  const timeoutMs = cekNumberPositive("text.timeoutMs", textRaw.timeoutMs ?? 15000, 1000, 120_000);

  let fallback: FallbackRuntime | undefined;
  if (textRaw.fallback !== undefined && textRaw.fallback !== null) {
    if (typeof textRaw.fallback !== "object" || Array.isArray(textRaw.fallback)) {
      throw new KesalahanKonfigurasi("text.fallback tidak valid (harus object).");
    }
    cekKunciTerlarang(textRaw.fallback, "text.fallback");
    const f = textRaw.fallback as Record<string, unknown>;
    const fp = toProviderRuntime(f.provider, "none");
    if (fp === "none") {
      throw new KesalahanKonfigurasi("text.fallback.provider tidak valid.");
    }
    const fm = bacaStringTrim(f.model, "");
    if (!fm) throw new KesalahanKonfigurasi("text.fallback.model wajib diisi.");
    fallback = { provider: fp, model: fm };
  }

  const rnRaw = (r.runtimeNarrative ?? {}) as Record<string, unknown>;
  const asRaw = (r.assistant ?? {}) as Record<string, unknown>;
  const imRaw = (r.image ?? {}) as Record<string, unknown>;
  const cgRaw = (r.caseGeneration ?? {}) as Record<string, unknown>;

  const imageModeRaw = typeof imRaw.mode === "string" ? imRaw.mode.trim().toUpperCase() : "HUMAN_IN_LOOP";
  const imageMode: ModeImageRuntime = imageModeRaw === "HUMAN_IN_LOOP" ? "HUMAN_IN_LOOP" : "HUMAN_IN_LOOP";
  if (typeof imRaw.mode === "string" && imageModeRaw !== "HUMAN_IN_LOOP") {
    throw new KesalahanKonfigurasi("image.mode tidak valid (hanya HUMAN_IN_LOOP).");
  }

  return {
    text: { enabled, provider, model, baseUrl, maxInputTokens, maxOutputTokens, maxRetries, timeoutMs, fallback },
    runtimeNarrative: { enabled: typeof rnRaw.enabled === "boolean" ? rnRaw.enabled : false },
    assistant: { enabled: typeof asRaw.enabled === "boolean" ? asRaw.enabled : false },
    image: { enabled: typeof imRaw.enabled === "boolean" ? imRaw.enabled : false, mode: imageMode },
    caseGeneration: { enabled: typeof cgRaw.enabled === "boolean" ? cgRaw.enabled : false },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : undefined,
  };
}

/**
 * Gabungan efektif: runtime (Firestore) menang bila ada; tanpa runtime →
 * default diwarisi dari env legacy sehingga behavior lama (provider=gemini,
 * model current) TIDAK berubah: flag fitur & budget mengikuti env.
 */
export function gabungKonfigurasiRuntime(
  env: {
    provider: ProviderAiTerpilih;
    textModel: string;
    imageModel: string;
    timeoutMs: number;
    maxRetries: number;
    maxOutputTokens: number;
    textReady: boolean;
    imageReady: boolean;
    caseGenerationEnabled: boolean;
    runtimeNarrativeEnabled: boolean;
    assistantEnabled: boolean;
  },
  runtime: KonfigurasiRuntimeAi | null,
): KonfigurasiRuntimeAi {
  if (runtime) return runtime;
  const d = konfigurasiRuntimeDefault();
  if (env.provider === "gemini") {
    d.text.provider = "gemini";
    d.text.model = env.textModel;
  }
  d.text.enabled = env.textReady;
  d.caseGeneration.enabled = env.caseGenerationEnabled;
  d.runtimeNarrative.enabled = env.runtimeNarrativeEnabled;
  d.assistant.enabled = env.assistantEnabled;
  d.image.enabled = env.imageReady;
  d.text.timeoutMs = env.timeoutMs;
  d.text.maxRetries = env.maxRetries;
  d.text.maxOutputTokens = env.maxOutputTokens;
  return d;
}

export function providerEfektifKeEnv(provider: ProviderRuntimeTerpilih): ProviderAiTerpilih {
  if (provider === "gemini") return "gemini";
  return "none";
}
