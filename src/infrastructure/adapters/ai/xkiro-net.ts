import { buatKesalahanProviderAi, type KategoriKesalahanAi } from "../../../ai/errors.js";

/**
 * Helper jaringan shared untuk adapter xKiro (OpenAI-compatible).
 * Satu-satunya tempat yang memanggil HTTP xKiro; fokus pada boundary,
 * timeout, dan mapping error terstruktur. TIDAK ada prompt/key/log di sini —
 * Authorization header hanya dikirim ke endpoint, tidak pernah dicatat.
 */
const API_BASE_DEFAULT = "https://api.xkiro.com/v1";

export interface OpsiPanggilanXkiro {
  apiKey: string;
  endpointPath: "chat/completions" | "messages/count_tokens" | "models" | "usage";
  payload?: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  apiBase?: string;
}

export interface ResponsXkiroNet {
  status: number;
  data: unknown | undefined;
}

/** Ujung fetch xKiro; melempar KesalahanProviderAi kategori TIMEOUT / PROVIDER_UNAVAILABLE. */
export async function panggilXkiro(opsi: OpsiPanggilanXkiro): Promise<ResponsXkiroNet> {
  const apiBase = (opsi.apiBase ?? API_BASE_DEFAULT).replace(/\/+$/, "");
  const url = `${apiBase}/${opsi.endpointPath}`;

  let res: Response;
  try {
    res = await opsi.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opsi.apiKey}`,
      },
      ...(opsi.payload ? { body: JSON.stringify(opsi.payload) } : {}),
      signal: AbortSignal.timeout(opsi.timeoutMs),
    });
  } catch (error) {
    const nama = (error instanceof Error ? error.name : "").toLowerCase();
    if (nama.includes("timeout") || nama.includes("abort")) {
      throw buatKesalahanProviderAi("TIMEOUT", "xKiro API timeout.", nama || undefined);
    }
    throw buatKesalahanProviderAi(
      "PROVIDER_UNAVAILABLE",
      "xKiro API tidak tersedia.",
      error instanceof Error ? error.name : "network",
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    if (res.ok || res.status < 500) {
      // 2xx/4xx dengan body non-JSON — respons tidak valid.
      throw buatKesalahanProviderAi("INVALID_RESPONSE", "xKiro tidak mengembalikan JSON valid.", res.status);
    }
    // 5xx body non-JSON (gateway/overload) — biarkan pemanggil memetakan status.
    data = undefined;
  }

  return { status: res.status, data };
}

/** Klasifikasi kode HTTP xKiro ke kategori error AI terstruktur. */
export function klasifikasikanStatusXkiro(status: number): KategoriKesalahanAi | null {
  if (status >= 200 && status < 300) return null;
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "AUTHENTICATION";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "QUOTA_RATE_LIMIT";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "INVALID_RESPONSE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ambil `choices[0].message.content` dari respons chat completions. */
export function uraiKontenXkiro(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const choices = data.choices;
  if (!Array.isArray(choices)) return null;
  const pilihan = choices[0];
  if (!isRecord(pilihan)) return null;
  const message = pilihan.message;
  if (!isRecord(message)) return null;
  const content = message.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

/** Metadata token generik hasil normalisasi respons provider (xKiro). */
export interface MetadataTokenXkiro {
  tokenInput?: number | undefined;
  tokenOutput?: number | undefined;
  tokenTotal?: number | undefined;
}

function angkaAtauTidak(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Parse `usage` chat completions: prompt_tokens/completion_tokens/total_tokens
 * (provider usage metadata — sumber utama). Absen → object kosong.
 */
export function uraiUsageXkiro(data: unknown): MetadataTokenXkiro {
  if (!isRecord(data)) return {};
  const usage = data.usage;
  if (!isRecord(usage)) return {};
  return {
    tokenInput: angkaAtauTidak(usage.prompt_tokens),
    tokenOutput: angkaAtauTidak(usage.completion_tokens),
    tokenTotal: angkaAtauTidak(usage.total_tokens),
  };
}

/**
 * Parse respons `messages/count_tokens` (estimasi input token; preflight
 * opsional bila `maxInputTokens` dikonfigurasi). Gagal/absen → null.
 */
export function uraiTotalTokensXkiro(data: unknown): number | null {
  if (!isRecord(data)) return null;
  const input = angkaAtauTidak(data.input_tokens);
  if (input !== undefined) return input;
  const total = angkaAtauTidak(data.total_tokens);
  return total ?? null;
}

export function tidurXkiro(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff kecil (100ms, 200ms, 400ms, …) — pola sama dengan adapter Gemini. */
export function backoffRetryXkiro(percobaan: number): number {
  return 100 * Math.min(2 ** percobaan, 8);
}
