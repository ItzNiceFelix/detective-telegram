export type TipePrompt = "case_generation" | "dialogue" | "hint" | "visual_prompt";

export interface PermintaanAi {
  promptType: TipePrompt;
  context: Record<string, unknown>;
  maxTokens?: number;
}

/**
 * Metadata penggunaan token generik dari AI adapter — provider-agnostic.
 * Opsional & backward-compatible: domain/Game Engine TIDAK bergantung padanya.
 * Tidak membocorkan field provider-specific ke domain.
 */
export interface PenggunaanAi {
  tokenInput?: number | undefined;
  tokenOutput?: number | undefined;
  tokenTotal?: number | undefined;
  tokenThinking?: number | undefined;
}

export interface ResponAi {
  output: string;
  warnings: string[];
  /** Metadata penggunaan token (opsional; null/unavailable → field absen). */
  usage?: PenggunaanAi | undefined;
}

export interface PintuAi {
  generateText(request: PermintaanAi): Promise<ResponAi>;
  generateImage?(request: PermintaanAi): Promise<ResponAi>;
}

export interface PenjagaAi {
  validasiOutput(output: unknown): boolean;
}

export { FakeAiProvider, FakeAIProvider, PenyediaAiPalsu } from "./fake-provider.js";
export * from "./visual-pipeline.js";
export * from "./detektif-asisten.js";
export type PenyediaAi = PintuAi;
