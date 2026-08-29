import type { PintuAi, PermintaanAi, ResponAi } from "../../../ai/contracts.js";

export class GatewayAiAdapter implements PintuAi {
  constructor(private readonly adapter: PintuAi) {}

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    return this.adapter.generateText(request);
  }
}
