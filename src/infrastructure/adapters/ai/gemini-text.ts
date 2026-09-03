import type { PintuAi, PermintaanAi, ResponAi } from "../../../ai/contracts.js";
import { buatKesalahanProviderAi } from "../../../ai/errors.js";
import {
  alasanBlokir,
  ambilTeksDariRespons,
  backoffRetry,
  klasifikasikanStatus,
  panggilGemini,
  tidur,
} from "./gemini-net.js";

export interface OpsiGeminiText {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  apiBase?: string;
}

/**
 * Adapter teks Gemini (real provider) mengimplementasikan `PintuAi`.
 * - structured/output JSON untuk `case_generation`;
 * - bounded output & bounded retry;
 * - timeout memakai AbortSignal;
 * - error dipetakan ke `KesalahanProviderAi` (kategori terstruktur);
 * - TIDAK memanggil provider dari CaseVersion/Game Engine — hanya aplikasi/admin.
 */
export class GeminiTextProvider implements PintuAi {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxOutputTokens: number;
  private readonly apiBase: string;

  constructor(private readonly opsi: OpsiGeminiText) {
    this.fetchImpl = opsi.fetchImpl ?? fetch;
    this.timeoutMs = opsi.timeoutMs ?? 15_000;
    this.maxRetries = opsi.maxRetries ?? 2;
    this.maxOutputTokens = opsi.maxOutputTokens ?? 2400;
    this.apiBase = opsi.apiBase ?? "https://generativelanguage.googleapis.com";
  }

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    const maxOutput = request.maxTokens ?? this.maxOutputTokens;
    const payload: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: this.bangunPrompt(request) }],
        },
      ],
      generationConfig: {
        maxOutputTokens: Math.min(maxOutput, this.maxOutputTokens),
        responseMimeType: this.promptTypeStructured(request.promptType) ? "application/json" : "text/plain",
        temperature: 0.4,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    };

    let percobaan = 0;
    while (true) {
      try {
        const { status, data } = await panggilGemini({
          apiKey: this.opsi.apiKey,
          model: this.opsi.model,
          endpointPath: "generateContent",
          payload,
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
          apiBase: this.apiBase,
        });

        if (status < 200 || status >= 300) {
          const kategori = klasifikasikanStatus(status) ?? "PROVIDER_UNAVAILABLE";
          const err = buatKesalahanProviderAi(kategori, `Gemini HTTP ${status}.`, status);
          if (kategori === "TIMEOUT" || kategori === "PROVIDER_UNAVAILABLE") {
            if (percobaan < this.maxRetries) {
              await tidur(backoffRetry(percobaan));
              percobaan += 1;
              continue;
            }
          }
          throw err;
        }

        const teks = ambilTeksDariRespons(data);
        if (teks === null) {
          const blokir = alasanBlokir(data) ?? "kandidat kosong";
          throw buatKesalahanProviderAi("UNSAFE_RESPONSE", `Gemini memblokir/merespons kosong (${blokir}).`, blokir);
        }
        if (teks.length === 0 || teks.length > this.maxOutputTokens * 6) {
          throw buatKesalahanProviderAi("INVALID_RESPONSE", "Output Gemini di luar batas panjang yang diizinkan.");
        }

        return { output: teks, warnings: [] };
      } catch (error) {
        if (this.layakRetry(error) && percobaan < this.maxRetries) {
          await tidur(backoffRetry(percobaan));
          percobaan += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private promptTypeStructured(tipe: string): boolean {
    return tipe === "case_generation" || tipe === "hint";
  }

  private bangunPrompt(request: PermintaanAi): string {
    // Prompt generik dari kontrak; TIDAK memuat secret/Firebase/Telegram.
    // Disarikan → client hanya melihat {promptType, context} (tanpa personal data).
    return [
      `Tipe permintaan: ${request.promptType}`,
      `Kontek:\n${JSON.stringify(request.context ?? {})}`,
      request.promptType === "case_generation"
        ? "Kembalikan hanya JSON valid sesuai skema kandidat kasus."
        : "Jawab hanya berdasarkan kontek yang diberikan.",
    ].join("\n");
  }

  private layakRetry(error: unknown): boolean {
    return error instanceof Error &&
      "kategori" in error &&
      (error as { kategori?: string }).kategori !== undefined &&
      ["TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(String((error as { kategori?: string }).kategori));
  }
}