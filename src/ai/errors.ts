import { KesalahanIntegrasi } from "../fondasi/eror.js";

/**
 * Kategori kesalahan terstruktur dari provider AI. Dipakai supaya pemanggil
 * (aplikasi/admin) dapat membedakan penyebab tanpa membaca string error —
 * sesuai dokumen integrasi AI (KesalahanIntegrasi terstruktur).
 */
export type KategoriKesalahanAi =
  | "AUTHENTICATION" // 401/403 — api key invalid
  | "QUOTA_RATE_LIMIT" // 429 — rate limit / kuota habis
  | "TIMEOUT" // timeout / abort
  | "INVALID_RESPONSE" // JSON/format respons rusak atau di luar kontrak
  | "UNSAFE_RESPONSE" // diblokir safety / output melanggar kontrak
  | "PROVIDER_UNAVAILABLE" // 5xx / network / provider mati
  | "DISABLED"; // fitur dimatikan oleh konfigurasi/feature flag

export class KesalahanProviderAi extends KesalahanIntegrasi {
  constructor(
    pesan: string,
    public readonly kategori: KategoriKesalahanAi,
    /** Umpan balik mesin (mis. kode error HTTP / blockReason), opsional. */
    public readonly kodeMekanis?: string | number | undefined,
  ) {
    super(pesan);
    this.name = "KesalahanProviderAi";
  }
}

export function buatKesalahanProviderAi(
  kategori: KategoriKesalahanAi,
  pesan: string,
  kodeMekanis?: string | number,
): KesalahanProviderAi {
  return new KesalahanProviderAi(pesan, kategori, kodeMekanis);
}

/** Apakah error layak di-retry (timeout / provider unavailable). Kesalahan lain JANGAN di-retry. */
export function layakRetry(error: unknown): boolean {
  return error instanceof KesalahanProviderAi &&
    (error.kategori === "TIMEOUT" || error.kategori === "PROVIDER_UNAVAILABLE");
}