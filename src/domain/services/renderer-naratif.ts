import type { SemanticResponse } from "../../kasus/case-bible.js";

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