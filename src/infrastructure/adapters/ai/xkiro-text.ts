import type { PintuAi, PermintaanAi, ResponAi, TipePrompt } from "../../../ai/contracts.js";
import { buatKesalahanProviderAi } from "../../../ai/errors.js";
import type { CatatanTelemetriAi, PenerimaTelemetriAi } from "./telemetri-ai.js";
import { petungOperasiAi } from "./telemetri-ai.js";
import {
  backoffRetryXkiro,
  klasifikasikanStatusXkiro,
  panggilXkiro,
  tidurXkiro,
  uraiKontenXkiro,
  uraiTotalTokensXkiro,
  uraiUsageXkiro,
} from "./xkiro-net.js";

export interface OpsiXkiroText {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  /** Budget token input (dari konfigurasi runtime). Pelanggaran → INVALID_RESPONSE. */
  maxInputTokens?: number | undefined;
  apiBase?: string;
  /** Preflight count opsional (default false; aktif otomatis bila maxInputTokens diset). */
  countTokensEnabled?: boolean;
  /** Penerima telemetri per-percobaan (opsional; lihat telemetri-ai.ts). */
  telemetri?: PenerimaTelemetriAi;
}

/**
 * Adapter teks xKiro (OpenAI-compatible chat completions) mengimplementasikan `PintuAi`.
 * - non-streaming chat completion; JSON diminta via prompt untuk `case_generation`;
 * - bounded output & bounded retry (hanya TIMEOUT/PROVIDER_UNAVAILABLE);
 * - timeout memakai AbortSignal;
 * - error dipetakan ke `KesalahanProviderAi` (kategori terstruktur);
 * - TIDAK memanggil provider dari CaseVersion/Game Engine — hanya aplikasi/admin.
 */
export class XkiroTextProvider implements PintuAi {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxOutputTokens: number;
  private readonly maxInputTokens: number | undefined;
  private readonly apiBase: string;
  private readonly countTokensEnabled: boolean;

  constructor(private readonly opsi: OpsiXkiroText) {
    this.fetchImpl = opsi.fetchImpl ?? fetch;
    this.timeoutMs = opsi.timeoutMs ?? 15_000;
    this.maxRetries = opsi.maxRetries ?? 2;
    this.maxOutputTokens = opsi.maxOutputTokens ?? 2400;
    this.maxInputTokens = opsi.maxInputTokens;
    this.apiBase = opsi.apiBase ?? "https://api.xkiro.com/v1";
    this.countTokensEnabled = opsi.countTokensEnabled ?? false;
  }

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    if (!this.opsi.model || this.opsi.model.trim().length === 0) {
      throw buatKesalahanProviderAi("MODEL_NOT_FOUND", "Model xKiro tidak dikonfigurasi.");
    }
    const maxOutput = Math.min(request.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens);
    const prompt = this.bangunPrompt(request);
    const payload: Record<string, unknown> = {
      model: this.opsi.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxOutput,
      temperature: 0.4,
      stream: false,
    };

    // Preflight count_tokens — opsional & gagal-aman; aktif otomatis bila
    // maxInputTokens dikonfigurasi (untuk menghormati token budget input).
    const preflightTokenInput = await this.preflightCountTokens(prompt);
    if (this.maxInputTokens !== undefined && preflightTokenInput !== undefined && preflightTokenInput > this.maxInputTokens) {
      throw buatKesalahanProviderAi(
        "INVALID_RESPONSE",
        `Estimasi input token ${preflightTokenInput} melebihi budget maxInputTokens ${this.maxInputTokens}.`,
      );
    }

    const mulai = Date.now();
    let percobaan = 0;
    while (true) {
      try {
        const { status, data } = await panggilXkiro({
          apiKey: this.opsi.apiKey,
          endpointPath: "chat/completions",
          payload,
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
          apiBase: this.apiBase,
        });

        if (status < 200 || status >= 300) {
          const kategori = klasifikasikanStatusXkiro(status) ?? "PROVIDER_UNAVAILABLE";
          const err = buatKesalahanProviderAi(kategori, `xKiro HTTP ${status}.`, status);
          if (kategori === "TIMEOUT" || kategori === "PROVIDER_UNAVAILABLE") {
            if (percobaan < this.maxRetries) {
              await tidurXkiro(backoffRetryXkiro(percobaan));
              percobaan += 1;
              continue;
            }
          }
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, undefined);
          throw err;
        }

        const teks = uraiKontenXkiro(data);
        if (teks === null) {
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, uraiUsageXkiro(data));
          throw buatKesalahanProviderAi("INVALID_RESPONSE", "xKiro mengembalikan content kosong.", status);
        }
        if (teks.length > this.maxOutputTokens * 6) {
          this.emitTelemetri(request.promptType, mulai, percobaan + 1, status, uraiUsageXkiro(data));
          throw buatKesalahanProviderAi("INVALID_RESPONSE", "Output xKiro di luar batas panjang yang diizinkan.");
        }

        // Sumber utama: provider usage metadata. Fallback (hanya bila absen):
        // estimasi tokenInput dari count_tokens preflight.
        const usage = uraiUsageXkiro(data);
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
          await tidurXkiro(backoffRetryXkiro(percobaan));
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
      provider: "xkiro",
      model: this.opsi.model,
      operation: petungOperasiAi((tipePrompt as TipePrompt) ?? "dialogue"),
      durationMs: Date.now() - mulai,
      attempt,
      status,
      ...(usage ?? {}),
    });
  }

  /**
   * Preflight count_tokens (opsional). Catch-all → undefined: pemanggil memilih
   * `tokenInput ?? null`. Tidak pernah melempar (gagal-aman eksekusi).
   */
  private async preflightCountTokens(prompt: string): Promise<number | undefined> {
    if (!this.countTokensEnabled && this.maxInputTokens === undefined) return undefined;
    try {
      const { status, data } = await panggilXkiro({
        apiKey: this.opsi.apiKey,
        endpointPath: "messages/count_tokens",
        payload: { model: this.opsi.model, messages: [{ role: "user", content: prompt }] },
        fetchImpl: this.fetchImpl,
        timeoutMs: Math.min(this.timeoutMs, 10_000),
        apiBase: this.apiBase,
      });
      if (status < 200 || status >= 300) return undefined;
      return uraiTotalTokensXkiro(data) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private bangunPrompt(request: PermintaanAi): string {
    // Prompt generik dari kontrak; TIDAK memuat secret/Firebase/Telegram.
    // xKiro non-streaming chat completions: structured output diminta lewat
    // instruksi prompt (kontrak PintuAi generik); parsing/validasi JSON tetap
    // di domain (strict, tanpa recovery semantik).
    // `skemaKandidat`/`contohKandidat` (jika ada di context) dirender sebagai
    // seksi terpisah agar terbaca model, bukan string JSON-escaped.
    const kontek = (request.context ?? {}) as Record<string, unknown>;
    const skema = typeof kontek.skemaKandidat === "string" ? kontek.skemaKandidat : undefined;
    const contoh = typeof kontek.contohKandidat === "string" ? kontek.contohKandidat : undefined;
    const basis: Record<string, unknown> = { ...kontek };
    if (skema !== undefined) delete basis.skemaKandidat;
    if (contoh !== undefined) delete basis.contohKandidat;
    const baris = [
      `Tipe permintaan: ${request.promptType}`,
      `Kontek:\n${JSON.stringify(basis)}`,
    ];
    if (request.promptType === "case_generation") {
      if (skema) baris.push(`Skema wajib:\n${skema}`);
      if (contoh) baris.push(`Contoh JSON minimal (ikuti bentuk & aturan referensinya):\n${contoh}`);
      baris.push("Kembalikan hanya JSON valid sesuai skema di atas.");
    } else {
      baris.push("Jawab hanya berdasarkan kontek yang diberikan.");
    }
    return baris.join("\n");
  }

  private layakRetry(error: unknown): boolean {
    return error instanceof Error &&
      "kategori" in error &&
      (error as { kategori?: string }).kategori !== undefined &&
      ["TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(String((error as { kategori?: string }).kategori));
  }
}
