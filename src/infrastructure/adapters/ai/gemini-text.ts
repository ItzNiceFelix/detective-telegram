import type { PintuAi, PermintaanAi, ResponAi, TipePrompt } from "../../../ai/contracts.js";
import { buatKesalahanProviderAi } from "../../../ai/errors.js";
import type { CatatanTelemetriAi, PenerimaTelemetriAi } from "./telemetri-ai.js";
import { petungOperasiAi } from "./telemetri-ai.js";
import {
  alasanBlokir,
  ambilTeksDariRespons,
  backoffRetry,
  klasifikasikanStatus,
  panggilGemini,
  tidur,
  uraiTotalTokens,
  uraiUsageMetadata,
} from "./gemini-net.js";

export interface OpsiGeminiText {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  apiBase?: string;
  /**
   * Opsional: aktifkan preflight `countTokens` untuk estimasi tokenInput
   * bila respons generateContent TIDAK menyediakan usageMetadata (Gemini
   * solid untuk generateContent—jarang kosong). Eksekusi preflight disengaja
   * gagal-aman: tidak pernah menggagalkan permintaan generate induknya.
   */
  countTokensEnabled?: boolean;
  /** Penerima telemetri per-percobaan (opsional; lihat telemetri-ai.ts). */
  telemetri?: PenerimaTelemetriAi;
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
  private readonly countTokensEnabled: boolean;

  constructor(private readonly opsi: OpsiGeminiText) {
    this.fetchImpl = opsi.fetchImpl ?? fetch;
    this.timeoutMs = opsi.timeoutMs ?? 15_000;
    this.maxRetries = opsi.maxRetries ?? 2;
    this.maxOutputTokens = opsi.maxOutputTokens ?? 2400;
    this.apiBase = opsi.apiBase ?? "https://generativelanguage.googleapis.com";
    this.countTokensEnabled = opsi.countTokensEnabled ?? false;
  }

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    const maxOutput = request.maxTokens ?? this.maxOutputTokens;
    const prompt = this.bangunPrompt(request);
    const payload: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
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

    // Prioritas 2: countTokens preflight — opsional & gagal-aman. Tidak pernah
    // menambah panggilan generate; endpoint terpisah & murah.
    const preflightTokenInput = await this.preflightCountTokens(payload);

    const mulai = Date.now();
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
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, undefined);
          throw err;
        }

        const teks = ambilTeksDariRespons(data);
        if (teks === null) {
          const blokir = alasanBlokir(data) ?? "kandidat kosong";
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, uraiUsageMetadata(data));
          throw buatKesalahanProviderAi("UNSAFE_RESPONSE", `Gemini memblokir/merespons kosong (${blokir}).`, blokir);
        }
        if (teks.length === 0 || teks.length > this.maxOutputTokens * 6) {
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, uraiUsageMetadata(data));
          throw buatKesalahanProviderAi("INVALID_RESPONSE", "Output Gemini di luar batas panjang yang diizinkan.");
        }

        // Prioritas 1: provider usage metadata. Fallback (hanya bila absen):
        // estimasi tokenInput dari countTokens preflight.
        const usage = uraiUsageMetadata(data);
        const tokenInput = usage.tokenInput ?? preflightTokenInput ?? undefined;
        const usageFinal = {
          ...usage,
          ...(tokenInput !== undefined ? { tokenInput } : {}),
        };
        const finalUsage = Object.keys(usageFinal).length > 0 ? usageFinal : undefined;

        this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, finalUsage);
        return { output: teks, warnings: [], usage: finalUsage };
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

  /** Rekam telemetri per-percobaan bila penerima tersedia. */
  private emitTelemetri(
    tipePrompt: string,
    mulai: number,
    attempt: number,
    status: number | null,
    usage: Partial<CatatanTelemetriAi> | undefined,
  ): void {
    this.opsi.telemetri?.({
      provider: "gemini",
      model: this.opsi.model,
      operation: petungOperasiAi((tipePrompt as TipePrompt) ?? "dialogue"),
      durationMs: Date.now() - mulai,
      attempt,
      status,
      ...(usage ?? {}),
    });
  }

  /**
   * Preflight countTokens (opsional). Catch-all → null : pemanggil memilih
   * `tokenInput ?? null`. Tidak pernah melempar (gagal-aman eksekusi).
   */
  private async preflightCountTokens(payload: Record<string, unknown>): Promise<number | undefined> {
    if (!this.countTokensEnabled) return undefined;
    try {
      const { status, data } = await panggilGemini({
        apiKey: this.opsi.apiKey,
        model: this.opsi.model,
        endpointPath: "countTokens",
        payload,
        fetchImpl: this.fetchImpl,
        timeoutMs: Math.min(this.timeoutMs, 10_000),
        apiBase: this.apiBase,
      });
      if (status < 200 || status >= 300) return undefined;
      return uraiTotalTokens(data) ?? undefined;
    } catch {
      return undefined;
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