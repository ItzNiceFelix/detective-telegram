import type { VercelRequest, VercelResponse } from "@vercel/node";
import { KomandoTelegramLayanan } from "../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../src/infrastructure/adapters/telegram/telegram.js";
import { validasiWebhookSecret } from "../src/security/audit.js";
import { dapatkanKomposisiAplikasi } from "../src/komposisi/komposisi-aplikasi.js";

/**
 * THIN ENTRYPOINT — Production Wiring Patch.
 * Tidak ada business logic / inline stub di sini. Semua dependency runtime
 * berasal dari composition root (src/komposisi/komposisi-aplikasi.ts).
 * Alur: validate request → resolve context → invoke application service → response.
 */

/** Ambil header nilai tunggal (handle array atau undefined). */
function ambilHeaderNilaiTunggal(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header)) return header[0];
  return header;
}

interface PermintaanHttpTelegram {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Record<string, unknown> | null;
}

export async function handlerInternal(
  request: PermintaanHttpTelegram = {},
): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
  const method = request.method?.toUpperCase() ?? "POST";

  let komposisi;
  try {
    komposisi = dapatkanKomposisiAplikasi();
  } catch (error) {
    // Fail clearly saat credential wajib tidak tersedia — tanpa membocorkan detail secret.
    console.error(JSON.stringify({
      level: "error",
      message: "komposisi_aplikasi_gagal",
      error: error instanceof Error ? error.name : "unknown",
    }));
    return {
      status: 500,
      body: JSON.stringify({ ok: false, error: "service_not_configured" }),
    };
  }

  if (method === "GET") {
    return {
      status: 200,
      body: JSON.stringify({ ok: true, service: "telegram", status: "ready" }),
    };
  }

  const envSecret = process.env.TELEGRAM_SECRET ?? "";
  const headerToken = ambilHeaderNilaiTunggal(request.headers?.["x-telegram-bot-api-secret-token"]);
  const keamananWebhook = validasiWebhookSecret(headerToken, envSecret);

  if (!keamananWebhook.valid) {
    return {
      status: 401,
      body: JSON.stringify({ ok: false, error: keamananWebhook.alasan ?? "unauthorized: invalid telegram secret" }),
    };
  }

  // Rate limiter milik composition root — bertahan lintas warm invocation.
  const rateKey = ambilHeaderNilaiTunggal(request.headers?.["x-forwarded-for"]) || ambilHeaderNilaiTunggal(request.headers?.["x-real-ip"]) || "telegram-global";
  const hasilRate = komposisi.penghitungBatasKejadian.periksa(rateKey);
  if (!hasilRate.diizinkan) {
    return {
      status: 429,
      body: JSON.stringify({ ok: false, error: "rate limited" }),
    };
  }

  let payload: unknown;
  if (typeof request.body === "string") {
    try {
      payload = JSON.parse(request.body);
    } catch {
      return {
        status: 400,
        body: JSON.stringify({ ok: false, error: "invalid json payload" }),
      };
    }
  } else if (request.body && typeof request.body === "object") {
    payload = request.body;
  } else {
    return {
      status: 400,
      body: JSON.stringify({ ok: false, error: "empty payload" }),
    };
  }

  const update = komposisi.pengirimTelegram.parseUpdate(payload);
const punyaKonten = payload !== null && typeof payload === "object" &&
  ("message" in (payload as Record<string, unknown>) || "callback_query" in (payload as Record<string, unknown>));

if (!update || !update.updateId) {
  return { status: 400, body: JSON.stringify({ ok: false, error: "invalid update_id" }) };
}

if (!punyaKonten) {
  // Update valid tapi tipe yang belum di-handle (my_chat_member, edited_message, dll)
  // — balas 200 supaya Telegram tidak menahan antrian dengan retry.
  return { status: 200, body: JSON.stringify({ ok: true, ignored: true }) };
}

  const hasil = await komposisi.layananKomando.prosesUpdate(update);

  if (hasil.status === "berhasil") {
    return {
      status: 200,
      body: JSON.stringify({ ok: true, command: hasil.data.command, message: hasil.data.message }),
    };
  }

  return {
    status: 200,
    body: JSON.stringify({ ok: false, error: hasil.error instanceof Error ? hasil.error.message : String(hasil.error) }),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const hasil = await handlerInternal({
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
  });

  if (hasil.headers) {
    for (const [key, value] of Object.entries(hasil.headers)) {
      res.setHeader(key, value);
    }
  }

  res.status(hasil.status).send(hasil.body);
}
