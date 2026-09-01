import type { SemanticResponse } from "../../kasus/case-bible.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";
import type { PintuAi, PermintaanAi } from "../../ai/contracts.js";

/**
 * Abstraksi renderer naratif. Implementasi deterministik saat ini hanya
 * mengembalikan teks semanticResponse apa adanya. Renderer AI di masa depan
 * dapat menggantikan implementasi ini TANPA mengubah Game Engine, karena
 * Game Engine hanya bergantung pada interface ini.
 */
export interface PintuRendererNaratif {
  renderRespon(semanticResponse: SemanticResponse): string;
}

export class RendererNaratifDeterministik implements PintuRendererNaratif {
  renderRespon(semanticResponse: SemanticResponse): string {
    return semanticResponse.text;
  }
}

export function validasiOutputNaratif(output: string): string {
  const teks = output.trim();
  if (teks.length === 0 || teks.length > 500) {
    throw new KesalahanValidasi("Output naratif di luar batas panjang yang diizinkan.");
  }

  const polaTerlarang = ["culprit", "murderer", "the answer is", "final accusation", "unlock all", "secret solution"];
  if (polaTerlarang.some((pola) => teks.toLowerCase().includes(pola))) {
    throw new KesalahanValidasi("Output naratif melanggar kontrak semantic response.");
  }

  return teks;
}

export class RendererNaratifAi implements PintuRendererNaratif {
  constructor(
    private readonly provider: PintuAi,
    private readonly fallback: PintuRendererNaratif = new RendererNaratifDeterministik(),
  ) {}

  async renderResponAsync(semanticResponse: SemanticResponse): Promise<string> {
    const request: PermintaanAi = {
      promptType: "dialogue",
      context: {
        semanticResponse,
        safeContext: { intent: "semantic_response_only" },
      },
      maxTokens: 250,
    };

    try {
      const hasil = await this.provider.generateText(request);
      const output = typeof hasil.output === "string" ? hasil.output : "";
      return validasiOutputNaratif(output);
    } catch {
      return this.fallback.renderRespon(semanticResponse);
    }
  }

  renderRespon(semanticResponse: SemanticResponse): string {
    return this.fallback.renderRespon(semanticResponse);
  }
}