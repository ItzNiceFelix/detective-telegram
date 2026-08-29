export type AksiTelegram = "investigate" | "inspect" | "theory" | "accuse" | "hint";

export interface PermintaanTelegram {
  updateId: string;
  userId?: string;
  chatId?: string;
  action?: AksiTelegram;
  payload?: Record<string, unknown>;
}

export interface ResponTelegram {
  chatId: string;
  text: string;
  keyboard?: unknown[];
}

export interface PintuTelegram {
  validasiWebhook(secret: string, payload: unknown): boolean;
  parseUpdate(payload: unknown): PermintaanTelegram;
  kirim(respon: ResponTelegram): Promise<void>;
}

export class TelegramAdapter implements PintuTelegram {
  validasiWebhook(secret: string, payload: unknown): boolean {
    return typeof secret === "string" && payload !== undefined;
  }

  parseUpdate(payload: unknown): PermintaanTelegram {
    return {
      updateId: "stub-update-id",
      payload: payload as Record<string, unknown>,
    };
  }

  async kirim(_respon: ResponTelegram): Promise<void> {
    return;
  }
}
