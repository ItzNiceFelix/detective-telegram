import type { VercelRequest, VercelResponse } from "@vercel/node";
import { KomandoTelegramLayanan } from "../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../src/infrastructure/adapters/telegram/telegram.js";
import { validasiWebhookSecret } from "../src/security/audit.js";
import { PenghitungBatasKejadian } from "../src/security/rate-limiter.js";

interface PermintaanHttpTelegram {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Record<string, unknown> | null;
}

async function handlerInternal(
  request: PermintaanHttpTelegram = {},
): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
  const method = request.method?.toUpperCase() ?? "POST";

  if (method === "GET") {
    return {
      status: 200,
      body: JSON.stringify({ ok: true, service: "telegram", status: "ready" }),
    };
  }

  const envSecret = process.env.TELEGRAM_SECRET ?? "";
  const headerToken = request.headers?.["x-telegram-bot-api-secret-token"];
  const tokenDariHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken ?? "";
  const keamananWebhook = validasiWebhookSecret(tokenDariHeader, envSecret);

  if (!keamananWebhook.valid) {
    return {
      status: 401,
      body: JSON.stringify({ ok: false, error: keamananWebhook.alasan ?? "unauthorized: invalid telegram secret" }),
    };
  }

  const limiter = new PenghitungBatasKejadian({
    maxPermintaan: Number(process.env.RATE_LIMIT_MAX_ACTIONS ?? "30"),
    jendelaMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60") * 1000,
  });
  const rateKey = request.headers?.["x-forwarded-for"] ?? request.headers?.["x-real-ip"] ?? "telegram-global";
  const ipKey = Array.isArray(rateKey) ? rateKey[0] : String(rateKey);
  const hasilRate = limiter.periksa(ipKey || "telegram-global");
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

  const adapter = new TelegramAdapter();
  const update = adapter.parseUpdate(payload);

  if (!update || !update.updateId) {
    return {
      status: 400,
      body: JSON.stringify({ ok: false, error: "unsupported telegram update" }),
    };
  }

  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => null,
      ambilVersiKasusTerbitan: async () => null,
    },
    repositoriSesiKasus: {
      ambil: async () => null,
      simpan: async (sesi) => sesi,
      transaksi: async <T>(runner: (transaction: any) => Promise<T>): Promise<T> => runner({} as any),
    },
    repositoriGrup: {
      ambil: async () => ({ telegramChatId: update.chatId ?? "stub-chat-id" }) as any,
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: {
      kirim: async () => undefined,
    },
    kontrakIdempoten: {
      ambilKunci: async () => null,
      simpanKunci: async () => undefined,
    },
    waktu: {
      sekarangIso: () => new Date().toISOString() as any,
    },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
  });

  const hasil = await layanan.prosesUpdate(update);

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
