import type {
  HasilSimpanGambarTerperinci,
  KontrakPenyimpananGambar,
  ObyekGambarTersimpan,
  PenyimpananGambarTerperinci,
} from "../../../ai/visual-pipeline.js";
import type { ObyekKirimFotoTelegram, PintuKirimFotoTelegram, TagihanFotoTelegram } from "../telegram/telegram.js";

/**
 * Penyimpanan Aset BETA via Telegram Asset Vault (docs/ASSET-STORAGE-DECISION.md).
 *
 * Implementasi `KontrakPenyimpananGambar` untuk `ASSET_STORAGE_BETA = TELEGRAM_BETA`.
 * - `simpan()`: upload binary via Bot API `sendPhoto` ke vault → return `file_id`.
 * - Referensi `file_id` BUKAN guaranteed durable URI ⇒ durability = BEST_EFFORT.
 * - `simpanTerperinci()` (ekstensi opsional) mengembalikan metadata (storageProvider,
 *   durability, verifiedAt, dimensi) untuk di-persist ke Firestore (tanpa binary).
 * - Verifikasi terjadi pada creation/publish (sendPhoto sukses == diterima & divalidasi
 *   oleh Telegram). TIDAK ada getFile/replay verification; TIDAK ada binary di Firestore.
 */
export interface OpsiPenyimpananAsetTelegram {
  /** ID channel vault (private channel disarankan), terpisah dari grup gameplay. */
  chatId: string;
  /** Telegram adapter (capability sendPhoto) — injectable untuk test. */
  telegram: PintuKirimFotoTelegram;
  /** Label provider penyimpanan; default TELEGRAM_BETA. */
  storageProvider?: string;
}

export class PenyimpananAsetTelegram implements PenyimpananGambarTerperinci {
  readonly storageProvider: string;
  readonly durability = "BEST_EFFORT" as const;

  constructor(private readonly opsi: OpsiPenyimpananAsetTelegram) {
    this.storageProvider = (opsi.storageProvider ?? "TELEGRAM_BETA").trim() || "TELEGRAM_BETA";
  }

  /** Kontrak dasar: simpan binary → return referensi (file_id). */
  async simpan(kunci: string, obyek: ObyekGambarTersimpan): Promise<string> {
    const hasil = await this.simpanTerperinci(kunci, obyek);
    return hasil.reference;
  }

  /** Upload via sendPhoto; kembalikan referensi + metadata untuk persist/verified. */
  async simpanTerperinci(kunci: string, obyek: ObyekGambarTersimpan): Promise<HasilSimpanGambarTerperinci> {
    const kirim: ObyekKirimFotoTelegram = {
      bytes: obyek.bytes,
      contentType: obyek.contentType,
      filename: `${this.sanitasiKunci(kunci)}.png`,
    };
    const tagihan: TagihanFotoTelegram = await this.opsi.telegram.kirimFotoTelegram(this.opsi.chatId, kirim);
    const waktu = new Date().toISOString();
    const hasil: HasilSimpanGambarTerperinci = {
      reference: tagihan.fileId,
      storageProvider: this.storageProvider,
      durability: this.durability,
      createdAt: waktu,
      mimeType: obyek.contentType,
      sizeBytes: tagihan.sizeBytes ?? obyek.bytes.byteLength,
    };
    if (tagihan.width !== undefined) hasil.width = tagihan.width;
    if (tagihan.height !== undefined) hasil.height = tagihan.height;
    return hasil;
  }

  /**
   * Ada-nya referensi (BEST_EFFORT). `file_id` valid non-kosong hasil sendPhoto
   * yang sukses dianggap VERIFIED saat creation. Tidak menjamin object di server
   * Telegram; replay TIDAK melakukan verifikasi getFile.
   */
  async ada(uri: string): Promise<boolean> {
    return typeof uri === "string" && uri.trim().length > 0;
  }

  private sanitasiKunci(kunci: string): string {
    const segmen = kunci
      .split(":")
      .map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, "_") || "_");
    return ["assets", "cases", ...segmen].join("/");
  }
}