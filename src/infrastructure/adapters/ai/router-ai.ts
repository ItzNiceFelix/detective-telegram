import type { PermintaanAi, PintuAi, ResponAi, TipePrompt } from "../../../ai/contracts.js";
import { buatKesalahanProviderAi } from "../../../ai/errors.js";
import { KesalahanKonfigurasi } from "../../../fondasi/eror.js";
import type {
  KonfigurasiRuntimeAi,
  ProviderRuntimeTerpilih,
} from "../../../ai/konfigurasi-runtime.js";
import { gabungKonfigurasiRuntime } from "../../../ai/konfigurasi-runtime.js";
import { GeminiTextProvider } from "./gemini-text.js";
import { XkiroTextProvider } from "./xkiro-text.js";
import { buatPenerimaTelemetriAi, type PenerimaTelemetriAi } from "./telemetri-ai.js";
import type { LoggerStruktur } from "../../../observability/logger.js";

export interface SumberKonfigurasiRuntimeAi {
  ambilKonfigurasi(): Promise<KonfigurasiRuntimeAi | null>;
}

export interface KunciProviderEnv {
  geminiApiKey?: string | undefined;
  xkiroApiKey?: string | undefined;
  bitdeerApiKey?: string | undefined;
}

export interface DefaultRuntimeEnv {
  provider: "gemini" | "fake" | "none";
  textModel: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  textReady: boolean;
  imageReady: boolean;
  caseGenerationEnabled: boolean;
  runtimeNarrativeEnabled: boolean;
  assistantEnabled: boolean;
}

export interface OpsiRouterAi {
  sumber: SumberKonfigurasiRuntimeAi;
  defaultsEnv: DefaultRuntimeEnv;
  kunci: KunciProviderEnv;
  logger?: LoggerStruktur | undefined;
  fetchImpl?: typeof fetch;
  countTokensEnabled?: boolean;
  ttlMs?: number;
}

export const TTL_KONFIGURASI_RUNTIME_MS = 45_000;

function fiturUntukPrompt(tipe: TipePrompt, cfg: KonfigurasiRuntimeAi): { enabled: boolean; nama: string } {
  switch (tipe) {
    case "case_generation":
      return { enabled: cfg.text.enabled && cfg.caseGeneration.enabled, nama: "caseGeneration" };
    case "dialogue":
      return { enabled: cfg.text.enabled && cfg.runtimeNarrative.enabled, nama: "runtimeNarrative" };
    case "hint":
      return { enabled: cfg.text.enabled && cfg.assistant.enabled, nama: "assistant" };
    case "visual_prompt":
      return { enabled: cfg.text.enabled && cfg.image.enabled, nama: "image" };
    default:
      return { enabled: false, nama: "unknown" };
  }
}

/**
 * AI Router — Application → Router → Provider Adapter.
 *
 * - Baca `ai_runtime_config/production` dengan TTL cache 45s + singleflight
 *   (tanpa query Firestore per request/token).
 * - Feature-gate eksplisit per promptType (tidak infer antar fitur).
 * - Seleksi adapter: gemini live; xkiro/bitdeer = error jelas (belum diimpl).
 * - Fallback primer→cadangan: abstraksi (aktif bila dikonfigurasi; satu
 *   percobaan ekstra, hanya untuk TIMEOUT/PROVIDER_UNAVAILABLE).
 * - Token budget dihormati tanpa silent override (output di-cap; input
 *   berlebih ditolak eksplisit).
 * - Kredensial SELALU dari env server; TIDAK pernah dari Firestore.
 */
export type FiturRuntimeAi = "caseGeneration" | "runtimeNarrative" | "assistant" | "image";

export class RouterAi implements PintuAi {
  private cache: { cfg: KonfigurasiRuntimeAi; kedaluwarsa: number } | null = null;
  private janjiBerjalan: Promise<KonfigurasiRuntimeAi> | null = null;
  private readonly ttlMs: number;
  private readonly adaptorCache = new Map<string, PintuAi>();

  constructor(private readonly opsi: OpsiRouterAi) {
    this.ttlMs = opsi.ttlMs ?? TTL_KONFIGURASI_RUNTIME_MS;
  }

  ambilKonfigurasiEfektif(): Promise<KonfigurasiRuntimeAi> {
    const sekarang = Date.now();
    if (this.cache && sekarang < this.cache.kedaluwarsa) {
      return Promise.resolve(this.cache.cfg);
    }
    if (this.janjiBerjalan) {
      return this.janjiBerjalan;
    }
    const janji = this.muatKonfigurasi()
      .then((cfg) => {
        this.cache = { cfg, kedaluwarsa: Date.now() + this.ttlMs };
        this.janjiBerjalan = null;
        return cfg;
      })
      .catch((error) => {
        this.janjiBerjalan = null;
        throw error;
      });
    this.janjiBerjalan = janji;
    return janji;
  }

  batalkanCache(): void {
    this.cache = null;
  }

  /**
   * Gerbang dinamis per fitur (untuk service sync-built: produksi kasus,
   * gambar). Melempar DISABLED bila fitur nonaktif di konfigurasi efektif.
   * Flag eksplisit — tidak infer antar fitur.
   */
  async pastikanAktif(fitur: FiturRuntimeAi): Promise<void> {
    const cfg = await this.ambilKonfigurasiEfektif();
    const aktif =
      fitur === "caseGeneration"
        ? cfg.text.enabled && cfg.caseGeneration.enabled
        : fitur === "runtimeNarrative"
          ? cfg.text.enabled && cfg.runtimeNarrative.enabled
          : fitur === "assistant"
            ? cfg.text.enabled && cfg.assistant.enabled
            : cfg.image.enabled;
    if (!aktif) {
      throw buatKesalahanProviderAi("DISABLED", `Fitur AI '${fitur}' dinonaktifkan oleh konfigurasi runtime.`);
    }
  }

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    const cfg = await this.ambilKonfigurasiEfektif();

    const fitur = fiturUntukPrompt(request.promptType, cfg);
    if (!fitur.enabled) {
      throw buatKesalahanProviderAi("DISABLED", `Fitur AI '${fitur.nama}' dinonaktifkan oleh konfigurasi runtime.`);
    }

    const maxOutputEfektif = Math.min(
      request.maxTokens ?? cfg.text.maxOutputTokens,
      cfg.text.maxOutputTokens,
    );
    const permintaanTerbatas: PermintaanAi = { ...request, maxTokens: maxOutputEfektif };

    try {
      return await this.generateDenganProvider(cfg.text.provider, cfg.text.model, cfg, permintaanTerbatas);
    } catch (error) {
      const fb = cfg.text.fallback;
      if (fb && this.layakFallback(error) && (fb.provider !== cfg.text.provider || fb.model !== cfg.text.model)) {
        return this.generateDenganProvider(fb.provider, fb.model, cfg, permintaanTerbatas);
      }
      throw error;
    }
  }

  private async generateDenganProvider(
    provider: ProviderRuntimeTerpilih,
    model: string,
    cfg: KonfigurasiRuntimeAi,
    request: PermintaanAi,
  ): Promise<ResponAi> {
    const adapter = this.adapterUntuk(provider, model, cfg);
    return adapter.generateText(request);
  }

  private adapterUntuk(provider: ProviderRuntimeTerpilih, model: string, cfg: KonfigurasiRuntimeAi): PintuAi {
    const kunci = [provider, model, cfg.text.baseUrl ?? "", cfg.text.timeoutMs, cfg.text.maxRetries, cfg.text.maxOutputTokens].join("|");
    const ada = this.adaptorCache.get(kunci);
    if (ada) return ada;

    const telemetri = this.telemetriUntuk(provider, model);
    let adapter: PintuAi;
    switch (provider) {
      case "gemini": {
        const apiKey = (this.opsi.kunci.geminiApiKey ?? "").trim();
        if (!apiKey) {
          throw buatKesalahanProviderAi("AUTHENTICATION", "GEMINI_API_KEY tidak tersedia di environment server.");
        }
        adapter = new GeminiTextProvider({
          apiKey,
          model,
          timeoutMs: cfg.text.timeoutMs,
          maxRetries: cfg.text.maxRetries,
          maxOutputTokens: cfg.text.maxOutputTokens,
          ...(cfg.text.maxInputTokens !== undefined ? { maxInputTokens: cfg.text.maxInputTokens } : {}),
          ...(cfg.text.baseUrl ? { apiBase: cfg.text.baseUrl } : {}),
          ...(this.opsi.fetchImpl ? { fetchImpl: this.opsi.fetchImpl } : {}),
          countTokensEnabled: this.opsi.countTokensEnabled ?? false,
          telemetri,
        });
        break;
      }
      case "xkiro": {
        const apiKey = (this.opsi.kunci.xkiroApiKey ?? "").trim();
        if (!apiKey) {
          throw buatKesalahanProviderAi("AUTHENTICATION", "XKIRO_API_KEY tidak tersedia di environment server.");
        }
        adapter = new XkiroTextProvider({
          apiKey,
          model,
          timeoutMs: cfg.text.timeoutMs,
          maxRetries: cfg.text.maxRetries,
          maxOutputTokens: cfg.text.maxOutputTokens,
          ...(cfg.text.maxInputTokens !== undefined ? { maxInputTokens: cfg.text.maxInputTokens } : {}),
          ...(cfg.text.baseUrl ? { apiBase: cfg.text.baseUrl } : {}),
          ...(this.opsi.fetchImpl ? { fetchImpl: this.opsi.fetchImpl } : {}),
          countTokensEnabled: this.opsi.countTokensEnabled ?? false,
          telemetri,
        });
        break;
      }
      case "bitdeer":
        throw new KesalahanKonfigurasi("Provider 'bitdeer' belum diimplementasikan (stub routing; tanpa adapter live).");
      case "none":
      default:
        throw buatKesalahanProviderAi("DISABLED", "Provider teks AI tidak dikonfigurasi (provider=none).");
    }

    if (this.adaptorCache.size >= 4) {
      const pertama = this.adaptorCache.keys().next();
      if (!pertama.done && pertama.value) this.adaptorCache.delete(pertama.value);
    }
    this.adaptorCache.set(kunci, adapter);
    return adapter;
  }

  private telemetriUntuk(provider: ProviderRuntimeTerpilih, model: string): PenerimaTelemetriAi {
    return buatPenerimaTelemetriAi(this.opsi.logger, provider, model);
  }

  private async muatKonfigurasi(): Promise<KonfigurasiRuntimeAi> {
    try {
      const dariFirestore = await this.opsi.sumber.ambilKonfigurasi();
      if (!dariFirestore) {
        return this.defaultDariEnv();
      }
      return dariFirestore;
    } catch {
      if (this.cache) {
        return this.cache.cfg;
      }
      return this.defaultDariEnv();
    }
  }

  private defaultDariEnv(): KonfigurasiRuntimeAi {
    const env = this.opsi.defaultsEnv;
    return gabungKonfigurasiRuntime(
      {
        provider: env.provider,
        textModel: env.textModel,
        imageModel: "",
        timeoutMs: env.timeoutMs,
        maxRetries: env.maxRetries,
        maxOutputTokens: env.maxOutputTokens,
        textReady: env.textReady,
        imageReady: env.imageReady,
        caseGenerationEnabled: env.caseGenerationEnabled,
        runtimeNarrativeEnabled: env.runtimeNarrativeEnabled,
        assistantEnabled: env.assistantEnabled,
      },
      null,
    );
  }

  private layakFallback(error: unknown): boolean {
    return error instanceof Error &&
      "kategori" in error &&
      ["TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(String((error as { kategori?: string }).kategori));
  }
}
