import type { Firestore, Transaction } from "firebase-admin/firestore";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";
import type { KontrakIdempoten, MetadataIdempoten } from "../../../event/domain.js";
import type { IdSesiKasus } from "../../../fondasi/primitif.js";

/**
 * Implementasi Firestore untuk KontrakIdempoten. Kunci idempotensi bersifat generic
 * (mis. "telegram:update:12345") dan TIDAK terikat pada sessionId, karena beberapa
 * aksi (contoh: /newcase) terjadi sebelum CaseSession ada.
 *
 * Dokumen sengaja dibuat kecil dan bounded — hanya menyimpan referensi/metadata,
 * tidak menyimpan payload Telegram mentah atau response.
 */
export class RepositoriIdempotenFirestore implements KontrakIdempoten {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "idempotency_keys";

  ambilKunci(actionId: string, sessionId: IdSesiKasus, transaction?: Transaction): Promise<MetadataIdempoten | null> {
    const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(this.buatIdDokumen(actionId));
    const operasiDokumen = transaction ? transaction.get(dokumenRef) : dokumenRef.get();

    return Promise.resolve(operasiDokumen)
      .then((dokumen) => {
        if (!dokumen.exists) {
          return null;
        }

        const data = dokumen.data() as Record<string, unknown> | undefined;
        return this.deserialize(data ?? {}, actionId, sessionId);
      })
      .catch((error) => {
        throw mapErrorFirestore(error);
      });
  }

  async simpanKunci(metadata: MetadataIdempoten, transaction?: Transaction): Promise<void> {
    try {
      const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(this.buatIdDokumen(metadata.actionId));
      const data = this.serialize(metadata);

      if (transaction) {
        transaction.set(dokumenRef, data);
        return;
      }

      await dokumenRef.set(data);
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  /**
   * Firestore document ID tidak boleh mengandung karakter "/" — actionId generic
   * seperti "telegram:update:123" aman karena hanya memakai ":" sebagai separator.
   */
  private buatIdDokumen(actionId: string): string {
    return actionId;
  }

  private serialize(metadata: MetadataIdempoten): Record<string, unknown> {
    return {
      actionId: metadata.actionId,
      sessionId: metadata.sessionId ? String(metadata.sessionId) : null,
      repeated: metadata.repeated,
      createdAt: new Date().toISOString(),
    };
  }

  private deserialize(data: Record<string, unknown>, actionId: string, sessionId: IdSesiKasus): MetadataIdempoten {
    return {
      actionId: typeof data.actionId === "string" ? data.actionId : actionId,
      sessionId: (typeof data.sessionId === "string" ? data.sessionId : String(sessionId)) as IdSesiKasus,
      repeated: true,
    };
  }
}