import { buatKesalahanProviderAi, type KategoriKesalahanAi } from "../../../ai/errors.js";

/**
 * Helper jaringan shared untuk adapter Gemini (text & image).
 * Satu-satunya tempat yang memanggil HTTP Gemini; fokus pada boundary,
 * timeout, retry, dan mapping error terstruktur. Tidak ada prompt/log di sini.
 */
export interface OpsiPanggilanGemini {
  apiKey: string;
  model: string;
  endpointPath: "generateContent";
  payload: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  apiBase?: string;
}

export interface ResponsGeminiNet {
  status: number;
  data: unknown | undefined;
}

const API_BASE_DEFAULT = "https://generativelanguage.googleapis.com";

/** Ujung fetch Gemini; melempar KesalahanProviderAi kategori TIMEOUT / PROVIDER_UNAVAILABLE / INVALID_RESPONSE. */
export async function panggilGemini(opsi: OpsiPanggilanGemini): Promise<ResponsGeminiNet> {
  const apiBase = opsi.apiBase ?? API_BASE_DEFAULT;
  const url = `${apiBase}/v1beta/models/${encodeURIComponent(opsi.model)}:${opsi.endpointPath}`;

  let res: Response;
  try {
    res = await opsi.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": opsi.apiKey,
      },
      body: JSON.stringify(opsi.payload),
      signal: AbortSignal.timeout(opsi.timeoutMs),
    });
  } catch (error) {
    const nama = (error instanceof Error ? error.name : "").toLowerCase();
    if (nama.includes("timeout") || nama.includes("abort")) {
      throw buatKesalahanProviderAi("TIMEOUT", "Gemini API timeout.", nama || undefined);
    }
    throw buatKesalahanProviderAi(
      "PROVIDER_UNAVAILABLE",
      "Gemini API tidak tersedia.",
      error instanceof Error ? error.name : "network",
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    if (res.ok || res.status < 500) {
      // Bukan JSON (mis. body kosong / malformed) — respons tidak valid.
      throw buatKesalahanProviderAi("INVALID_RESPONSE", "Gemini tidak mengembalikan JSON valid.", res.status);
    }
    data = undefined;
  }

  return { status: res.status, data };
}

/** Klasifikasi kode HTTP ke kategori error AI terstruktur. */
export function klasifikasikanStatus(status: number): KategoriKesalahanAi | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return "AUTHENTICATION";
  if (status === 429) return "QUOTA_RATE_LIMIT";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "INVALID_RESPONSE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ambilBagian(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value)) return [];
  const candidates = value.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.filter(isRecord);
}

/** Gabungkan teks dari parts kandidat pertama (respons generateContent). */
export function ambilTeksDariRespons(data: unknown): string | null {
  const kandidat = ambilBagian(data)[0];
  const content = kandidat ? kandidat.content : undefined;
  if (!isRecord(content)) return null;
  const parts = content.parts;
  if (!Array.isArray(parts)) return null;
  const teks = parts.filter(isRecord)
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
  return teks.length > 0 ? teks : null;
}

export function alasanBlokir(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const fb = data.promptFeedback;
  if (isRecord(fb) && typeof fb.blockReason === "string") return fb.blockReason;
  return null;
}

/** Data image pertama (inlineData) bila ada — dipakai image adapter. */
export function ambilImageInline(data: unknown): { mimeType: string; data: string } | null {
  const kandidat = ambilBagian(data)[0];
  const content = kandidat ? kandidat.content : undefined;
  if (!isRecord(content)) return null;
  const parts = content.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (isRecord(p) && isRecord(p.inlineData)) {
      const id = p.inlineData;
      if (typeof id.data === "string" && (id.data.length > 0) && typeof id.mimeType === "string") {
        return { mimeType: id.mimeType, data: id.data };
      }
    }
  }
  return null;
}

export function tidur(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff kecil (100ms, 200ms, 400ms, …) sebelum retry timeout/unavailable. */
export function backoffRetry(percobaan: number): number {
  return 100 * Math.min(2 ** percobaan, 8);
}