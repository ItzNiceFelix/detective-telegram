export type AksiTelegram = "investigate" | "inspect" | "theory" | "accuse" | "hint";

export interface PermintaanTelegram {
  updateId: string;
  userId: string | undefined;
  chatId: string | undefined;
  chatType: "private" | "group" | "supergroup" | "channel" | "unknown";
  text: string | undefined;
  command: string | undefined;
  action?: AksiTelegram;
  payload: Record<string, unknown>;
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
    return typeof secret === "string" && secret.length > 0 && payload !== undefined;
  }

  parseUpdate(payload: unknown): PermintaanTelegram {
    const data = (payload ?? {}) as Record<string, unknown>;
    const rawMessage = (data.message as Record<string, unknown> | undefined) ?? (data.callback_query as Record<string, unknown> | undefined);
    const message = rawMessage && typeof rawMessage === "object" ? (rawMessage as Record<string, unknown>) : undefined;
    const chat = message && typeof message.chat === "object" ? (message.chat as Record<string, unknown>) : undefined;
    const nestedMessage = message && typeof message.message === "object" ? (message.message as Record<string, unknown>) : undefined;
    const nestedChat = nestedMessage && typeof nestedMessage.chat === "object" ? (nestedMessage.chat as Record<string, unknown>) : undefined;
    const from = message && typeof message.from === "object" ? (message.from as Record<string, unknown>) : undefined;
    const nestedFrom = nestedMessage && typeof nestedMessage.from === "object" ? (nestedMessage.from as Record<string, unknown>) : undefined;
    const text = message && typeof message.text === "string" ? message.text : message && typeof message.data === "string" ? message.data : undefined;
    const finalFrom = from ?? nestedFrom;
    const chatTypeValue = chat && typeof chat.type === "string" ? chat.type : nestedChat && typeof nestedChat.type === "string" ? nestedChat.type : undefined;

    const userIdValue = finalFrom && typeof finalFrom["id"] === "number" ? String(finalFrom["id"]) : undefined;
    const chatIdValue = chat && typeof chat["id"] === "number" ? String(chat["id"]) : undefined;

    const normalizedText = typeof text === "string" ? text.trim() : undefined;
    let command: string | undefined;
    if (typeof normalizedText === "string") {
      const token = normalizedText.split(/\s+/)[0] ?? "";
      if (token.startsWith("/")) {
        command = token.toLowerCase();
      }
    }

    return {
      updateId: typeof data.update_id === "number" ? String(data.update_id) : "stub-update-id",
      userId: userIdValue,
      chatId: chatIdValue,
      chatType: typeof chatTypeValue === "string" ? (chatTypeValue as "private" | "group" | "supergroup" | "channel" | "unknown") : "unknown",
      text: normalizedText,
      command,
      payload: data,
    };
  }

  async kirim(_respon: ResponTelegram): Promise<void> {
    return;
  }
}
