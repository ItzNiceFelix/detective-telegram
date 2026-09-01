import type { Firestore } from "firebase-admin/firestore";
import type { IdSesiKasus } from "../../../fondasi/primitif.js";
import type { KontribusiPemain } from "../../../domain/services/skor.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";

export class RepositoriKontribusiFirestore {
  constructor(private readonly firestore: Firestore) {}

  private koleksi(sessionId: IdSesiKasus) {
    return this.firestore.collection("case_sessions").doc(String(sessionId)).collection("contributions");
  }

  async ambilSemuaUntukSesi(sessionId: IdSesiKasus): Promise<KontribusiPemain[]> {
    try {
      const snapshot = await this.koleksi(sessionId).get();
      return snapshot.docs.map((doc) => doc.data() as KontribusiPemain);
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  /**
   * docId = sourceEventId → compare-and-set idempotency: create() gagal jika
   * dokumen sudah ada, sehingga concurrent duplicate call hanya satu yang sukses.
   */
  async tambahJikaBaru(sessionId: IdSesiKasus, kontribusi: KontribusiPemain): Promise<boolean> {
    try {
      const ref = this.koleksi(sessionId).doc(kontribusi.sourceEventId);
      try {
        await ref.create(kontribusi as any);
        return true;
      } catch {
        return false; // sudah ada — idempotent no-op
      }
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }
}