import { KesalahanIntegrasi, KesalahanKonfigurasi } from "../../../fondasi/eror.js";

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

/**
 * Status keanggotaan Telegram (getChatMember.result.status).
 * Dipakai oleh validator akses/admin grup — diputuskan server-side,
 * tidak pernah dari payload klien (docs/23-security-moderation-contract.md).
 */
export type StatusAnggotaTelegram =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface OpsiPengirimTelegram {
  /** Default: process.env.TELEGRAM_BOT_TOKEN. */
  botToken?: string;
  /** Injeksi fetch untuk test; default global fetch. */
  fetchImpl?: typeof fetch;
  /** Timeout outbound Telegram dalam ms; default 10000. */
  timeoutMs?: number;
  /** Base URL API Telegram; hanya di-override pada test. */
  apiBase?: string;
}

const TIMEOUT_DEFAULT_MS = 10_000;
const API_BASE_DEFAULT = "https://api.telegram.org";

interface ResponApiTelegram {
  ok?: unknown;
  result?: unknown;
  description?: unknown;
  error_code?: unknown;
}

export class TelegramAdapter implements PintuTelegram {
  private readonly botToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiBase: string;

  constructor(opsi: OpsiPengirimTelegram = {}) {
    this.botToken = (opsi.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    this.fetchImpl = opsi.fetchImpl ?? fetch;
    this.timeoutMs = opsi.timeoutMs ?? TIMEOUT_DEFAULT_MS;
    this.apiBase = opsi.apiBase ?? API_BASE_DEFAULT;
  }

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
      updateId: typeof data.update_id === "number" ? String(data.update_id) : "",
      userId: userIdValue,
      chatId: chatIdValue,
      chatType: typeof chatTypeValue === "string" ? (chatTypeValue as "private" | "group" | "supergroup" | "channel" | "unknown") : "unknown",
      text: normalizedText,
      command,
      payload: data,
    };
  }

  /** Kirim pesan ke chat Telegram via Bot API `sendMessage`. */
  async kirim(respon: ResponTelegram): Promise<void> {
    return this.kirimPesanTelegram(respon.chatId, respon.text);
  }

  /**
   * Outbound Telegram sendMessage. Selalu dipanggil SETELAH commit Firestore
   * (PERSIST-07) — tidak pernah di dalam transaction. Kegagalan menghasilkan
   * KesalahanIntegrasi terstruktur; token tidak pernah masuk ke pesan error.
   */
  async kirimPesanTelegram(chatId: string, text: string): Promise<void> {
    if (!this.botToken) {
      throw new KesalahanKonfigurasi("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
    }

    await this.panggilApiTelegram("sendMessage", {
      chat_id: chatId,
      text,
    });
  }

  /**
   * Lookup keanggotaan chat via Bot API `getChatMember`. Mengembalikan null
   * ketika API gagal — pemanggil (validator) wajib fail-closed.
   */
  async ambilStatusAnggota(chatId: string, userId: string): Promise<StatusAnggotaTelegram | null> {
    if (!this.botToken) {
      throw new KesalahanKonfigurasi("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
    }

    try {
      const data = (await this.panggilApiTelegram("getChatMember", {
        chat_id: chatId,
        user_id: Number(userId),
      })) as ResponApiTelegram;

      const result = data.result as Record<string, unknown> | undefined;
      const status = result?.status;

      if (typeof status !== "string") {
        return null;
      }

      return status as StatusAnggotaTelegram;
    } catch {
      // API gagal → penelepon memutuskan kebijakan fail-closed.
      return null;
    }
  }

  private async panggilApiTelegram(metode: string, payload: Record<string, unknown>): Promise<unknown> {
    // Token hanya ada di URL; jangan pernah dimasukkan ke pesan error/log.
    const url = `${this.apiBase}/bot${this.botToken}/${metode}`;

    let respons: Response;
    try {
      respons = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new KesalahanIntegrasi(`Telegram API ${metode} timeout.`);
      }
      throw new KesalahanIntegrasi(
        `Telegram API ${metode} gagal: ${error instanceof Error ? error.message : "unknown"}.`,
      );
    }

    if (!respons.ok) {
      throw new KesalahanIntegrasi(`Telegram API ${metode} HTTP ${respons.status}.`);
    }

    let data: unknown;
    try {
      data = await respons.json();
    } catch {
      throw new KesalahanIntegrasi(`Telegram API ${metode} respons tidak valid (bukan JSON).`);
    }

    if (data === null || typeof data !== "object" || typeof (data as ResponApiTelegram).ok !== "boolean") {
      throw new KesalahanIntegrasi(`Telegram API ${metode} respons malformed.`);
    }

    const hasil = data as ResponApiTelegram;
    if (hasil.ok !== true) {
      const deskripsi = typeof hasil.description === "string" ? hasil.description : "tanpa deskripsi";
      throw new KesalahanIntegrasi(`Telegram API ${metode} ok=false: ${deskripsi}.`);
    }

    return data;
  }
}

export function buatPengirimTelegram(opsi: OpsiPengirimTelegram = {}): TelegramAdapter {
  return new TelegramAdapter(opsi);
}
