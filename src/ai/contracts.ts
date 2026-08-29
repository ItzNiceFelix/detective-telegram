export type TipePrompt = "case_generation" | "dialogue" | "hint" | "visual_prompt";

export interface PermintaanAi {
  promptType: TipePrompt;
  context: Record<string, unknown>;
  maxTokens?: number;
}

export interface ResponAi {
  output: string;
  warnings: string[];
}

export interface PintuAi {
  generateText(request: PermintaanAi): Promise<ResponAi>;
  generateImage?(request: PermintaanAi): Promise<ResponAi>;
}

export interface PenjagaAi {
  validasiOutput(output: unknown): boolean;
}
