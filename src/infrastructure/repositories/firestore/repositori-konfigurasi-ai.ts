import type { Firestore } from "firebase-admin/firestore";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";
import { KesalahanKonfigurasi } from "../../../fondasi/eror.js";
import { validasiDanNormalisasiRuntime, type KonfigurasiRuntimeAi } from "../../../ai/konfigurasi-runtime.js";

export interface KontrakRepositoriKonfigurasiAi {
  ambilKonfigurasi(): Promise<KonfigurasiRuntimeAi | null>;
}

const KOLEKSI = "ai_runtime_config";
const DOKUMEN = "production";

/**
 * Baca konfigurasi AI runtime dari Firestore (`ai_runtime_config/production`).
 * Server-side ONLY. Kredensial TIDAK pernah hidup di sini: dokumen divalidasi
 * dan field key-like (`apiKey`/`secret`/`token`/`credential`/`password`)
 * ditolak saat parsing — mencegah config bocor/rumit ke klien/proxy.
 */
export class RepositoriKonfigurasiAiFirestore implements KontrakRepositoriKonfigurasiAi {
  constructor(private readonly firestore: Firestore) {}

  async ambilKonfigurasi(): Promise<KonfigurasiRuntimeAi | null> {
    try {
      const doc = await this.firestore.collection(KOLEKSI).doc(DOKUMEN).get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data() ?? {};
      return validasiDanNormalisasiRuntime(data);
    } catch (error) {
      if (error instanceof KesalahanKonfigurasi) {
        // Konfigurasi invalid (mis. key di Firestore / field salah) → aman:
        // panggil memilih fallback. Laporkan agar admin tahu, tanpa crash.
        throw error;
      }
      throw mapErrorFirestore(error);
    }
  }
}