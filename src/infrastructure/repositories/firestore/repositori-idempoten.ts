import type { Firestore, Transaction } from "firebase-admin/firestore";
import { apakahDokumenSudahAda, mapErrorFirestore } from "../../firebase/error-mapper.js";
import type { HasilKlaimIdempoten, KontrakIdempoten, MetadataIdempoten } from "../../../event/domain.js";
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

  /** Format kunci update-level (docs/21.5): telegram:update:{updateId}. */
  buatKunciUpdateTelegram(updateId: string): string {
    return `telegram:update:${updateId}`;
  }

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

  /**
   * Klaim atomic kunci idempotensi.
   * - Dalam transaction: get + create; transaction Firestore yang concurrent
   *   pada dokumen sama akan conflict dan retry, sehingga hanya satu yang menang.
   * - Tanpa transaction: doc.create() — ALREADY_EXISTS berarti sudah diklaim.
   */
  async klaimKunci(actionId: string, sessionId: IdSesiKasus, transaction?: Transaction): Promise<HasilKlaimIdempoten> {
    const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(this.buatIdDokumen(actionId));
    const data = this.serialize({ actionId, sessionId, repeated: false });

    if (transaction) {
      const dokumen = await transaction.get(dokumenRef);
      if (dokumen.exists) {
        return { sudahAda: true };
      }
      transaction.create(dokumenRef, data);
      return { sudahAda: false };
    }

    try {
      await dokumenRef.create(data);
      return { sudahAda: false };
    } catch (error) {
      if (apakahDokumenSudahAda(error)) {
        return { sudahAda: true };
      }
      throw mapErrorFirestore(error);
    }
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