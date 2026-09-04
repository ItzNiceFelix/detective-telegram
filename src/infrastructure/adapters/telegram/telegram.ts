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
  /** Callback query inbound (tombol inline). Actor SELALU dari `from`, bukan data. */
  callback?: {
    callbackId: string;
    data: string;
    messageId?: number | undefined;
  } | undefined;
}

/** Satu tombol inline: teks tampil + data callback kompak berversi. */
export interface TombolInlineTelegram {
  teks: string;
  data: string;
}

/** Keyboard inline: array baris, tiap baris array tombol. */
export type KibordInlineTelegram = TombolInlineTelegram[][];

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

/** Byte gambar yang diunggah ke vault via Bot API `sendPhoto`. */
export interface ObyekKirimFotoTelegram {
  bytes: Uint8Array;
  contentType?: string;
  filename?: string;
}

/** Hasil upload foto: `file_id` (tidak boleh dianggap durable — BEST_EFFORT). */
export interface TagihanFotoTelegram {
  fileId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/** Data submission foto reply inbound (parsing webhook) — struktural saja. */
export interface KirimanFotoTelegram {
  updateId: string;
  chatId: string | undefined;
  userId: string | undefined;
  replyToMessageId: number | undefined;
  fileId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/** Dependency sempit untuk storage: capability adapter, TANPA business logic. */
export interface PintuKirimFotoTelegram {
  kirimFotoTelegram(chatId: string, foto: ObyekKirimFotoTelegram): Promise<TagihanFotoTelegram>;
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

/** Luas foto (width×height) untuk memilih resolusi tertinggi; 0 bila tidak ada. */
function luasFoto(f: { width?: unknown; height?: unknown } | undefined): number {
  if (!f) return 0;
  const w = typeof f.width === "number" ? f.width : 0;
  const h = typeof f.height === "number" ? f.height : 0;
  return w * h;
}

/** Pilih `file_id` dari foto resolusi tertinggi; null bila tidak ada. */
export function ambilFileIdFoto(
  foto: Array<{ file_id?: unknown; width?: unknown; height?: unknown; file_size?: unknown }>,
): { fileId: string; width?: number; height?: number; sizeBytes?: number } | null {
  let tertinggi = foto[0];
  for (const p of foto) {
    if (luasFoto(p) > luasFoto(tertinggi)) tertinggi = p;
  }
  const fileId = typeof tertinggi?.file_id === "string" ? tertinggi.file_id : "";
  if (!fileId) return null;
  const hasil: { fileId: string; width?: number; height?: number; sizeBytes?: number } = { fileId };
  const lebar = nilaiAngka(tertinggi?.width);
  const tinggi = nilaiAngka(tertinggi?.height);
  const ukuran = nilaiAngka(tertinggi?.file_size);
  if (lebar !== undefined) hasil.width = lebar;
  if (tinggi !== undefined) hasil.height = tinggi;
  if (ukuran !== undefined) hasil.sizeBytes = ukuran;
  return hasil;
}

function nilaiAngka(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

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

  /** Serialisasi keyboard inline ke payload Bot API (button → {text, callback_data}). */
  serialisasiKibord(kibord: KibordInlineTelegram): Array<Array<{ text: string; callback_data: string }>> {
    return kibord.map((baris) => baris.map((t) => ({ text: t.teks, callback_data: t.data })));
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
    const nestedMessageChatForType = nestedMessage && typeof nestedMessage.chat === "object" ? (nestedMessage.chat as Record<string, unknown>) : undefined;
    const chatTypeValue = chat && typeof chat.type === "string"
      ? chat.type
      : nestedMessageChatForType && typeof nestedMessageChatForType.type === "string"
        ? nestedMessageChatForType.type
        : nestedChat && typeof nestedChat.type === "string"
          ? nestedChat.type
          : undefined;

    const userIdValue = finalFrom && typeof finalFrom["id"] === "number" ? String(finalFrom["id"]) : undefined;
    const nestedMessageChat = nestedMessage && typeof nestedMessage.chat === "object" ? (nestedMessage.chat as Record<string, unknown>) : undefined;
    const chatUntukId = chat ?? nestedMessageChat;
    const chatIdValue = chatUntukId && typeof chatUntukId["id"] === "number" ? String(chatUntukId["id"]) : undefined;

    const normalizedText = typeof text === "string" ? text.trim() : undefined;
    let command: string | undefined;
    if (typeof normalizedText === "string") {
      const token = normalizedText.split(/\s+/)[0] ?? "";
      if (token.startsWith("/")) {
        // Strip @botusername suffix (Telegram adds this in groups)
        const baseCommand = token.split("@")[0] ?? "";
        command = baseCommand.toLowerCase();
      }
    }

    let callback: PermintaanTelegram["callback"];
    if (data.callback_query && typeof data.callback_query === "object") {
      const cb = data.callback_query as Record<string, unknown>;
      const cbId = typeof cb.id === "string" ? cb.id : typeof cb.id === "number" ? String(cb.id) : undefined;
      const cbData = typeof cb.data === "string" ? cb.data : undefined;
      const cbMsg = cb.message && typeof cb.message === "object" ? (cb.message as Record<string, unknown>) : undefined;
      const cbMsgId = cbMsg && typeof cbMsg.message_id === "number" ? cbMsg.message_id : undefined;
      if (cbId && cbData) callback = { callbackId: cbId, data: cbData, messageId: cbMsgId };
    }

    return {
      updateId: typeof data.update_id === "number" ? String(data.update_id) : "",
      userId: userIdValue,
      chatId: chatIdValue,
      chatType: typeof chatTypeValue === "string" ? (chatTypeValue as "private" | "group" | "supergroup" | "channel" | "unknown") : "unknown",
      text: normalizedText,
      command,
      payload: data,
      callback,
    };
  }

  /** Kirim pesan ke chat Telegram via Bot API `sendMessage`. */
  async kirim(respon: ResponTelegram): Promise<void> {
    await this.kirimPesanTelegram(respon.chatId, respon.text);
  }

  /**
   * Kirim pesan + inline keyboard. Mengembalikan message_id untuk lifecycle
   * (mis. disimpan sebagai HUD id). Tanpa parse_mode default; Markdown hanya
   * bila teks memuat code block tap-to-copy.
   */
  async kirimPesanKibord(
    chatId: string,
    text: string,
    kibord: KibordInlineTelegram,
    opsi?: { parseMode?: "Markdown"; disableNotification?: boolean },
  ): Promise<number> {
    if (!this.botToken) {
      throw new KesalahanKonfigurasi("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
    }
    const data = (await this.panggilApiTelegram("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: this.serialisasiKibord(kibord) },
      ...(opsi?.parseMode ? { parse_mode: opsi.parseMode } : {}),
      ...(opsi?.disableNotification ? { disable_notification: true } : {}),
    })) as ResponApiTelegram;
    const result = data.result as { message_id?: unknown } | undefined;
    return typeof result?.message_id === "number" ? result.message_id : 0;
  }

  /**
   * Edit teks + keyboard pesan yang sudah ada (menu/paginasi/HUD aggregate).
   * Gagal (mis. message not found / tidak berubah) → KesalahanIntegrasi;
   * pemanggil wajib graceful (UI refresh bukan mutasi kanonik).
   */
  async suntingPesanKibord(
    chatId: string,
    messageId: number,
    text: string,
    kibord?: KibordInlineTelegram,
    opsi?: { parseMode?: "Markdown" },
  ): Promise<void> {
    await this.panggilApiTelegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(kibord ? { reply_markup: { inline_keyboard: this.serialisasiKibord(kibord) } } : {}),
      ...(opsi?.parseMode ? { parse_mode: opsi.parseMode } : {}),
    });
  }

  /**
   * Acknowledge callback query — menghentikan spinner Telegram. Selalu
   * dipanggil secepatnya; teks opsional untuk feedback singkat.
   * Kegagalan diabaikan (best-effort, bukan mutasi kanonik).
   */
  async jawabCallback(callbackId: string, teks?: string): Promise<void> {
    try {
      await this.panggilApiTelegram("answerCallbackQuery", {
        callback_query_id: callbackId,
        ...(teks ? { text: teks.slice(0, 200) } : {}),
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Sematkan pesan (HUD utama). Gagal (mis. tanpa izin admin) → KesalahanIntegrasi;
   * pemanggil wajib graceful — pin adalah presentation state, bukan game state.
   */
  async sematkanPesan(chatId: string, messageId: number): Promise<void> {
    await this.panggilApiTelegram("pinChatMessage", { chat_id: chatId, message_id: messageId });
  }

  /** Lepas sematan. Gagal → KesalahanIntegrasi; pemanggil wajib graceful. */
  async lucutiSematPesan(chatId: string, messageId: number): Promise<void> {
    await this.panggilApiTelegram("unpinChatMessage", { chat_id: chatId, message_id: messageId });
  }

  /** Hapus pesan (UI temporer). Gagal → KesalahanIntegrasi; pemanggil wajib graceful. */
  async padamPesan(chatId: string, messageId: number): Promise<void> {
    await this.panggilApiTelegram("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  /**
   * Outbound Telegram sendMessage. Selalu dipanggil SETELAH commit Firestore
   * (PERSIST-07) — tidak pernah di dalam transaction. Kegagalan menghasilkan
   * KesalahanIntegrasi terstruktur; token tidak pernah masuk ke pesan error.
   * parseMode "Markdown" dipakai pesan yang memuat code block (tap-to-copy);
   * default tanpa parse_mode agar teks biasa tidak rusak oleh karakter Markdown.
   */
  async kirimPesanTelegram(chatId: string, text: string, opsi?: { parseMode?: "Markdown" | "HTML" }): Promise<number> {
    if (!this.botToken) {
      throw new KesalahanKonfigurasi("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
    }

    const data = (await this.panggilApiTelegram("sendMessage", {
      chat_id: chatId,
      text,
      ...(opsi?.parseMode ? { parse_mode: opsi.parseMode } : {}),
    })) as ResponApiTelegram;
    const result = data.result as { message_id?: unknown } | undefined;
    const messageId = typeof result?.message_id === "number" ? result.message_id : 0;
    return messageId;
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

  /**
   * Outbound Bot API `sendPhoto` — multipart/form-data, upload binary gambar ke
   * vault (asset provider beta). Mengembalikan `file_id` resolusi tertinggi plus
   * dimensi/ukuran. Token hanya ada di URL; tidak pernah di body/error/log.
   * Ini capability murni (bukan business logic); verifikasi/recovery domain lain.
   */
  async kirimFotoTelegram(chatId: string, foto: ObyekKirimFotoTelegram): Promise<TagihanFotoTelegram> {
    if (!this.botToken) {
      throw new KesalahanKonfigurasi("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
    }
    if (!foto || foto.bytes.byteLength === 0) {
      throw new KesalahanIntegrasi("Foto kosong tidak dapat diunggah ke Telegram.");
    }

    const jenis = (foto.contentType ?? "image/png").trim() || "image/png";
    const formData = new FormData();
    formData.set("chat_id", chatId);
    formData.set("photo", new Blob([new Uint8Array(foto.bytes)], { type: jenis }), foto.filename ?? "asset.png");

    // fetch menentukan boundary multipart sendiri; konten-type TIDAK diset manual.
    const data = (await this.panggilApiTelegramMultipart("sendPhoto", formData)) as ResponApiTelegram;
    const result = data.result as
      | { photo?: Array<{ file_id?: unknown; width?: unknown; height?: unknown; file_size?: unknown }> }
      | undefined;
    const photo = Array.isArray(result?.photo) ? result.photo : [];

    let tertinggi = photo[0];
    for (const p of photo) {
      if (luasFoto(p) > luasFoto(tertinggi)) tertinggi = p;
    }
    const fileId = typeof tertinggi?.file_id === "string" ? tertinggi.file_id : "";
    if (!fileId) {
      throw new KesalahanIntegrasi("Telegram API sendPhoto tidak mengembalikan photo.file_id.");
    }

    const lebar = nilaiAngka(tertinggi?.width);
    const tinggi = nilaiAngka(tertinggi?.height);
    const ukuran = nilaiAngka(tertinggi?.file_size);
    const hasil: TagihanFotoTelegram = { fileId };
    if (lebar !== undefined) hasil.width = lebar;
    if (tinggi !== undefined) hasil.height = tinggi;
    if (ukuran !== undefined) hasil.sizeBytes = ukuran;
    return hasil;
  }

  /**
   * Ekstrak submission foto (photo reply) dari update Telegram inbound.
   * Hanya mengembalikan data estrutural; TIDAK pernah menyimpan full message
   * ataupun binary. `photo[].file_id` resolusi tertinggi -> referensi beta.
   * Mengembalikan null bila update bukan photo reply/photo.
   */
  ekstrakKirimanFoto(payload: unknown): KirimanFotoTelegram | null {
    const data = (payload ?? {}) as Record<string, unknown>;
    const msg = data.message && typeof data.message === "object" ? (data.message as Record<string, unknown>) : undefined;
    if (!msg) return null;

    const chat = msg.chat && typeof msg.chat === "object" ? (msg.chat as Record<string, unknown>) : undefined;
    const from = msg.from && typeof msg.from === "object" ? (msg.from as Record<string, unknown>) : undefined;
    const photo = Array.isArray(msg.photo) ? msg.photo : [];
    const pilih = ambilFileIdFoto(photo);
    if (!pilih) return null;

    const balasan = msg.reply_to_message && typeof msg.reply_to_message === "object" ? (msg.reply_to_message as Record<string, unknown>) : undefined;
    const replyMessageId = typeof balasan?.message_id === "number" ? balasan.message_id : undefined;

    const kiriman: KirimanFotoTelegram = {
      updateId: typeof data.update_id === "number" ? String(data.update_id) : "",
      chatId: chat && typeof chat.id === "number" ? String(chat.id) : chat && typeof chat.id === "string" ? chat.id : undefined,
      userId: from && typeof from.id === "number" ? String(from.id) : undefined,
      replyToMessageId: replyMessageId,
      fileId: pilih.fileId,
    };
    if (pilih.width !== undefined) kiriman.width = pilih.width;
    if (pilih.height !== undefined) kiriman.height = pilih.height;
    if (pilih.sizeBytes !== undefined) kiriman.sizeBytes = pilih.sizeBytes;
    return kiriman;
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

  /** Outbound Bot API multipart (sendPhoto). Disarikan dari panggilApiTelegram. */
  private async panggilApiTelegramMultipart(metode: string, formData: FormData): Promise<unknown> {
    const url = `${this.apiBase}/bot${this.botToken}/${metode}`;

    let respons: Response;
    try {
      respons = await this.fetchImpl(url, {
        method: "POST",
        body: formData,
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
