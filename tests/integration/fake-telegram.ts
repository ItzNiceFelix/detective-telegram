import type { VersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatVersiKasus, publikasiVersiKasus, StatusVersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdKasus, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";

/**
 * Fixture published CaseVersion dari Golden Case (tanpa AI) untuk smoke/integration.
 */
export function buatVersiKasusEmasTerbitan(): VersiKasus {
  const draft = buatVersiKasus({
    caseId: buatIdKasus(String(goldenCaseBible.caseId)),
    versionId: buatIdVersiKasus("V1"),
    schemaVersion: 1,
    metadata: {
      title: goldenCaseBible.title,
      premise: "Jonathan Reed ditemukan tewas di Room 407.",
      genre: "MISTERI",
      tags: ["golden", "hotel"],
      starRating: 3,
    },
    caseBibleRef: goldenCaseBible.caseBibleRef,
    assetManifestRef: "assets:CASE-001:V1:manifest",
    contentSummary: "Golden Case fixture untuk smoke test produksi.",
    status: StatusVersiKasus.DRAFT,
  });

  return publikasiVersiKasus(draft, buatWaktuIso("2026-01-01T00:00:00.000Z"));
}

export interface PanggilanTelegram {
  metode: string;
  url: string;
  payload: Record<string, unknown>;
}

export interface FetchTelegramPalsu {
  fetchImpl: typeof fetch;
  panggilan: PanggilanTelegram[];
  gagalkanMetode(metode: string, error: Error): void;
}

/**
 * Fake fetch untuk Telegram Bot API: mencatat panggilan sendMessage /
 * getChatMember tanpa jaringan nyata. `statusAnggota` memetakan
 * "chatId:userId" -> status (creator/administrator/member/left/...).
 */
export function buatFetchTelegramPalsu(statusAnggota: Record<string, string> = {}): FetchTelegramPalsu {
  const panggilan: PanggilanTelegram[] = [];
  const metodeGagal = new Map<string, Error>();
  let sendCounter = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const metode = url.split("/").pop() ?? "";
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    panggilan.push({ metode, url, payload });

    const errorTerkendali = metodeGagal.get(metode);
    if (errorTerkendali) {
      throw errorTerkendali;
    }

    const buatRespon = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (metode === "sendMessage") {
      sendCounter += 1;
      return buatRespon({ ok: true, result: { message_id: sendCounter, chat: { id: payload.chat_id } } });
    }

    if (metode === "editMessageText") {
      return buatRespon({ ok: true, result: true });
    }

    if (metode === "answerCallbackQuery") {
      return buatRespon({ ok: true, result: true });
    }

    if (metode === "pinChatMessage" || metode === "unpinChatMessage" || metode === "deleteMessage") {
      return buatRespon({ ok: true, result: true });
    }

    if (metode === "getChatMember") {
      const kunci = `${String(payload.chat_id)}:${String(payload.user_id)}`;
      const status = statusAnggota[kunci] ?? "left";
      return buatRespon({ ok: true, result: { status } });
    }

    return buatRespon({ ok: false, description: `metode tidak dikenal: ${metode}` }, 400);
  };

  return {
    fetchImpl,
    panggilan,
    gagalkanMetode(metode: string, error: Error) {
      metodeGagal.set(metode, error);
    },
  };
}