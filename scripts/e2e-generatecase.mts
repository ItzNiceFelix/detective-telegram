import { readFileSync } from "node:fs";
for (const f of [".env", ".env.opencode.local"]) {
  try {
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
      const t = l.trim(); if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("="); if (i > 0) { const k = l.slice(0, i).trim(); if (k && !(k in process.env)) process.env[k] = l.slice(i+1).trim(); }
    }
  } catch {}
}
const { handlerInternal } = await import("../api/telegram.js");

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const grup = process.argv[2] ?? "-1004479884518";
const userName = process.argv[3] ?? "";

async function telAPIGet(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `https://api.telegram.org/bot${token}/${method}` + (params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : "");
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return await res.json() as Record<string, unknown>;
}

async function getUserId(username: string): Promise<number> {
  const upd = await telAPIGet("getUpdates", { limit: 100, timeout: 0 }) as { result?: Array<Record<string, unknown>> };
  for (const u of upd.result ?? []) {
    const m = u.message as Record<string, unknown> | undefined;
    if (m) {
      const from = m.from as Record<string, unknown> | undefined;
      const ufrom = from?.username as string | undefined;
      if (ufrom && ufrom.toLowerCase() === username.toLowerCase()) return from.id as number;
      const chat = m.chat as Record<string, unknown> | undefined;
      if (chat && String(chat.id) === grup) { /* candidate */ }
    }
  }
  // fallback: getChatMember via member of group not possible for arbitrary user; use group chat photo? skip.
  throw new Error("tidak dapat resolve user id dari getUpdates; coba resolusi lain");
}

const admins = (await telAPIGet("getChatAdministrators", { chat_id: grup }) as { result?: Array<Record<string, unknown>> }).result ?? [];
const user = admins.find((a) => (a.user as Record<string, unknown>).username && String((a.user as Record<string, unknown>).username).toLowerCase() === userName.toLowerCase());
if (!user) { console.error("GAGAL: user tidak ditemukan di admin grup"); process.exit(1); }
const userId = (user.user as Record<string, unknown>).id as number;
console.log(`user=${userName} id=${userId} status=${user.status}`);

// Kirim /generatecase sebagai user tsb (payload direct ke handlerInternal)
const payload = {
  update_id: Math.floor(Date.now() / 1000) % 10000000,
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: Number(grup), type: "supergroup", title: "Data anjay" },
    from: { id: userId, is_bot: false, first_name: userName, username: userName },
    text: "/generatecase mystery",
  },
};
console.log("Mengirim /generatecase ...");
const t0 = Date.now();
const hasil = await handlerInternal({ method: "POST", headers: { "x-telegram-bot-api-secret-token": process.env.TELEGRAM_SECRET ?? "" }, body: JSON.stringify(payload) });
console.log("HTTP " + hasil.status + " dalam " + (Date.now() - t0) + "ms");
console.log("BODY: " + hasil.body.slice(0, 600));