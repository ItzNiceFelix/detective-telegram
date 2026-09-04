import type { Firestore } from "firebase-admin/firestore";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";
import type { CaseBible } from "../../../kasus/case-bible.js";
import type { KontrakRepositoriCaseBible } from "../../../kasus/case-bible-repository.js";

/**
 * Penyimpanan Case Bible hasil generate AI ke Firestore (`case_bibles/{ref}`).
 * Tanpa ini, case AI yang terbit tidak playable: semua command gameplay
 * melempar "Case Bible tidak ditemukan" karena repo statis hanya punya golden.
 * Case Bible adalah data kanonik immutable per CaseVersion (bukan secret).
 */
export class RepositoriCaseBibleFirestore implements KontrakRepositoriCaseBible {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "case_bibles";

  async simpanCaseBible(caseBible: CaseBible): Promise<void> {
    try {
      await this.firestore
        .collection(this.namaKoleksi)
        .doc(caseBible.caseBibleRef)
        .set(JSON.parse(JSON.stringify(caseBible)) as Record<string, unknown>);
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  async ambilCaseBible(ref: string): Promise<CaseBible | null> {
    try {
      const dokumen = await this.firestore.collection(this.namaKoleksi).doc(ref).get();
      if (!dokumen.exists) return null;
      return dokumen.data() as unknown as CaseBible;
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }
}

/**
 * Gabungan: statis (golden fixture, cepat) + Firestore (bible AI hasil generate).
 * Urutan: statis dulu, lalu Firestore. Kontrak tetap KontrakRepositoriCaseBible.
 */
export class RepositoriCaseBibleGabungan implements KontrakRepositoriCaseBible {
  constructor(
    private readonly statis: KontrakRepositoriCaseBible,
    private readonly firestoreRepo: KontrakRepositoriCaseBible,
  ) {}

  async ambilCaseBible(ref: string): Promise<CaseBible | null> {
    const dariStatis = await this.statis.ambilCaseBible(ref);
    if (dariStatis) return dariStatis;
    return this.firestoreRepo.ambilCaseBible(ref);
  }
}
