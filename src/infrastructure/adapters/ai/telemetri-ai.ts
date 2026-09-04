import type { PenggunaanAi, TipePrompt } from "../../../ai/contracts.js";
import type { LoggerStruktur } from "../../../observability/logger.js";

/**
 * Telemetri penggunaan AI — telemetry. Memisahkan pengukuran (latency,
 * attempt, HTTP status, token) dari log terstruktur. Hanya metadata generik
 * yang direkam; TIDAK pernah ada prompt, Case Bible, respons penuh, API key,
 * maupun data pribadi pengguna.
 */

export interface CatatanTelemetriAi {
  provider: string;
  model: string;
  operation: string;
  tokenInput?: number | undefined;
  tokenOutput?: number | undefined;
  tokenTotal?: number | undefined;
  tokenThinking?: number | undefined;
  durationMs: number;
  attempt: number;
  status: number | null;
}

export type PenerimaTelemetriAi = (catatan: CatatanTelemetriAi) => void;

/**
 * Peta operation dari tipe permintaan (kontrak domain → label telemetri).
 * `case_generation` → `CASE_GENERATION` (path `/generatecase`).
 */
export function petungOperasiAi(promptType: TipePrompt): string {
  switch (promptType) {
    case "case_generation":
      return "CASE_GENERATION";
    case "dialogue":
      return "DIALOGUE";
    case "hint":
      return "HINT";
    case "visual_prompt":
      return "VISUAL_PROMPT";
    default:
      return "UNKNOWN";
  }
}

/**
 * Bangun penerima telemetri yang mencetak log terstruktur
 * `ai_generation_usage` ke `LoggerStruktur`. Tanpa logger → penerima no-op
 * (telemetri opsional, tidak pernah menggagalkan generation).
 */
export function buatPenerimaTelemetriAi(
  logger: LoggerStruktur | undefined,
  provider: string,
  model: string,
): PenerimaTelemetriAi {
  return (catatan: CatatanTelemetriAi) => {
    if (!logger) return;
    logger.info("ai_generation_usage", {
      provider: catatan.provider || provider,
      model: catatan.model || model,
      operation: catatan.operation,
      tokenInput: catatan.tokenInput ?? null,
      tokenOutput: catatan.tokenOutput ?? null,
      tokenTotal: catatan.tokenTotal ?? null,
      ...(catatan.tokenThinking !== undefined ? { tokenThinking: catatan.tokenThinking } : {}),
      durationMs: catatan.durationMs,
      attempt: catatan.attempt,
      status: catatan.status,
    });
  };
}

/** Penerima no-op — untuk test/injeksi yang tidak ingin telemetri. */
export function penerimaTelemetriNoop(): PenerimaTelemetriAi {
  return () => {};
}

export { rangkumPakai };

function rangkumPakai(pakai?: PenggunaanAi): Pick<CatatanTelemetriAi, "tokenInput" | "tokenOutput" | "tokenTotal" | "tokenThinking"> {
  return {
    tokenInput: pakai?.tokenInput,
    tokenOutput: pakai?.tokenOutput,
    tokenTotal: pakai?.tokenTotal,
    tokenThinking: pakai?.tokenThinking,
  };
}