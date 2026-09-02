import type { Grup } from "../../domain/entities.js";
import { KesalahanKonfigurasi } from "../../fondasi/eror.js";
import { buatIdGrup, buatWaktuIso, type IdGrup } from "../../fondasi/primitif.js";
import type { StatusAnggotaTelegram } from "../../infrastructure/adapters/telegram/telegram.js";

/**
 * Kontrak minimal lookup keanggotaan Telegram (getChatMember). Implementasi
 * nyata: TelegramAdapter. Dipanggil DI LUAR Firestore transaction; hasilnya
 * boleh di-cache (docs/23.2 — role selalu di-resolve server-side).
 */
export interface KlienStatusAnggotaTelegram {
  ambilStatusAnggota(chatId: string, userId: string): Promise<StatusAnggotaTelegram | null>;
}

interface EntriCache {
  status: StatusAnggotaTelegram | null;
  kadaluarsa: number;
}

const TTL_CACHE_POSITIF_MS = 5 * 60_000;
const TTL_CACHE_NEGATIF_MS = 30_000;

function statusMenandaiAnggota(status: StatusAnggotaTelegram | null): boolean {
  return status === "creator" || status === "administrator" || status === "member" || status === "restricted";
}

/**
 * Cache lookup keanggotaan bersama (bounded: satu entri per user:chat).
 * Fail-closed: ketika Telegram API gagal, status dianggap tidak berwenang.
 */
class CacheStatusAnggota {
  private readonly entri = new Map<string, EntriCache>();

  constructor(private readonly klien: KlienStatusAnggotaTelegram) {}

  async ambil(chatId: string, userId: string): Promise<StatusAnggotaTelegram | null> {
    const kunci = `${chatId}:${userId}`;
    const cache = this.entri.get(kunci);

    if (cache && cache.kadaluarsa > Date.now()) {
      return cache.status;
    }

    const status = await this.klien.ambilStatusAnggota(chatId, userId);
    this.entri.set(kunci, {
      status,
      kadaluarsa: Date.now() + (status === null ? TTL_CACHE_NEGATIF_MS : TTL_CACHE_POSITIF_MS),
    });

    return status;
  }
}

/**
 * Validasi konteks grup server-side:
 * - grup yang sudah terdaftar wajib berstatus ACTIVE (DISABLED ditolak);
 * - grup baru didaftarkan otomatis saat bot pertama kali menerima perintah
 *   (create-if-missing, tidak pernah menimpa pointer sesi aktif).
 */
export class ValidatorGrupTelegram {
  constructor(
    private readonly repositoriGrup: {
      ambil(groupId: IdGrup): Promise<Grup | null>;
      buatJikaTidakAda(grup: Grup): Promise<Grup>;
    },
    private readonly waktu: { sekarangIso(): string },
  ) {}

  async validasi(chatId: string): Promise<boolean> {
    if (!chatId) {
      return false;
    }

    const groupId = buatIdGrup(chatId);
    const grup = await this.repositoriGrup.ambil(groupId);

    if (grup) {
      return grup.status === "ACTIVE";
    }

    try {
      await this.repositoriGrup.buatJikaTidakAda({
        groupId,
        telegramChatId: chatId,
        createdAt: buatWaktuIso(this.waktu.sekarangIso()),
        status: "ACTIVE",
      });
      return true;
    } catch (error) {
      if (error instanceof KesalahanKonfigurasi) {
        throw error;
      }
      return false;
    }
  }
}

/** Validasi akses member grup: gagal-ditutup ketika lookup Telegram gagal. */
export class ValidatorAksesTelegram {
  private readonly cache: CacheStatusAnggota;

  constructor(klien: KlienStatusAnggotaTelegram) {
    this.cache = new CacheStatusAnggota(klien);
  }

  async validasi(userId: string, chatId: string): Promise<boolean> {
    if (!userId || !chatId) {
      return false;
    }

    const status = await this.cache.ambil(chatId, userId);
    return statusMenandaiAnggota(status);
  }
}

/** Validasi admin grup untuk /startcase: creator/administrator saja. */
export class ValidatorAdminGrupTelegram {
  private readonly cache: CacheStatusAnggota;

  constructor(klien: KlienStatusAnggotaTelegram) {
    this.cache = new CacheStatusAnggota(klien);
  }

  async validasi(userId: string, chatId: string): Promise<boolean> {
    if (!userId || !chatId) {
      return false;
    }

    const status = await this.cache.ambil(chatId, userId);
    return status === "creator" || status === "administrator";
  }
}