import type { Firestore } from "firebase-admin/firestore";
import { FirestorePalsu } from "./fake-firestore.js";
import { buatFetchTelegramPalsu, buatVersiKasusEmasTerbitan, type FetchTelegramPalsu } from "./fake-telegram.js";
import { buatKomposisiAplikasi, type KomposisiAplikasi } from "../../src/komposisi/komposisi-aplikasi.js";
import { WaktuFiktif } from "../../src/fondasi/waktu.js";
import type { VersiKasus } from "../../src/kasus/versi-kasus.js";
import type { PintuAi } from "../../src/ai/contracts.js";
import type { KontrakPenyediaGambar } from "../../src/ai/visual-pipeline.js";
import type { KonfigurasiAi } from "../../src/ai/konfigurasi.js";

export interface KomposisiUji {
  firestore: FirestorePalsu;
  telegram: FetchTelegramPalsu;
  komposisi: KomposisiAplikasi;
}

/** Injeksi AI admin/offline untuk test. Default: provider tidak ada (deterministik). */
export interface OpsiUjiAi {
  konfigurasiAi?: KonfigurasiAi;
  penyediaTeks?: PintuAi | undefined;
  penyediaGambar?: KontrakPenyediaGambar | undefined;
  /** Chat vault asset utk test Human-in-the-Loop. */
  vaultChatId?: string;
}

export function buatKomposisiUji(statusAnggota: Record<string, string> = {}, opsiAi?: OpsiUjiAi): KomposisiUji {
  const firestore = new FirestorePalsu();
  const telegram = buatFetchTelegramPalsu(statusAnggota);

  const komposisi = buatKomposisiAplikasi({
    firestore: firestore as unknown as Firestore,
    pengirimTelegram: { botToken: "TEST-TOKEN", fetchImpl: telegram.fetchImpl },
    waktu: new WaktuFiktif(new Date("2026-02-01T00:00:00.000Z")),
    ...(opsiAi?.konfigurasiAi !== undefined ? { konfigurasiAi: opsiAi.konfigurasiAi } : {}),
    ...(opsiAi?.penyediaTeks !== undefined ? { penyediaTeks: opsiAi.penyediaTeks } : {}),
    ...(opsiAi?.penyediaGambar !== undefined ? { penyediaGambar: opsiAi.penyediaGambar } : {}),
    ...(opsiAi?.vaultChatId !== undefined ? { vaultChatId: opsiAi.vaultChatId } : {}),
  });

  return { firestore, telegram, komposisi };
}

export async function seedVersiKasusTerbitan(komposisi: KomposisiAplikasi): Promise<VersiKasus> {
  const versi = buatVersiKasusEmasTerbitan();
  await komposisi.repositoriVersiKasus.simpanVersiKasus(versi);
  return versi;
}

export function buatUpdateGrup(updateId: number, teks: string, chatId: number | string = -1001, userId = 42): Record<string, unknown> {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      text: teks,
      chat: { id: Number(chatId), type: "group" },
      from: { id: userId, username: "detektif" },
    },
  };
}

/** Parse payload Telegram wire-format lalu proses lewat application service. */
export async function prosesPerintah(
  komposisi: KomposisiAplikasi,
  updateId: number,
  teks: string,
  chatId: number | string = -1001,
  userId = 42,
) {
  const update = komposisi.pengirimTelegram.parseUpdate(buatUpdateGrup(updateId, teks, chatId, userId));
  return komposisi.layananKomando.prosesUpdate(update);
}