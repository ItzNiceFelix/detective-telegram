import { KesalahanValidasi } from "../fondasi/eror.js";
import type { PermintaanAi, PintuAi, ResponAi } from "./contracts.js";

export class FakeAiProvider implements PintuAi {
  public calls: PermintaanAi[] = [];
  public responses: Array<string | ResponAi>;

  constructor(responses: Array<string | ResponAi> = []) {
    this.responses = [...responses];
  }

  async generateText(request: PermintaanAi): Promise<ResponAi> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (!next) {
      throw new KesalahanValidasi("FakeAIProvider tidak memiliki response yang tersisa.");
    }

    if (typeof next === "string") {
      return { output: next, warnings: [] };
    }

    return next;
  }
}

export const PenyediaAiPalsu = FakeAiProvider;
export const FakeAIProvider = FakeAiProvider;
