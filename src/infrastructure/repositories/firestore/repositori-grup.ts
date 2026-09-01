import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { Grup } from "../../../domain/entities.js";
import type { IdGrup } from "../../../fondasi/primitif.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";

export interface KontrakRepositoriGrupFirestore {
  ambil(groupId: IdGrup, transaction?: Transaction): Promise<Grup | null>;
  simpan(grup: Grup, transaction?: Transaction): Promise<Grup>;
}

export class RepositoriGrupFirestore implements KontrakRepositoriGrupFirestore {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "groups";

  ambil(groupId: IdGrup, transaction?: Transaction): Promise<Grup | null> {
    const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(String(groupId));
    const operasiDokumen = transaction ? transaction.get(dokumenRef) : dokumenRef.get();

    return Promise.resolve(operasiDokumen)
      .then((dokumen) => {
        if (!dokumen.exists) {
          return null;
        }

        const data = dokumen.data() as Record<string, unknown> | undefined;
        return this.deserialize(data ?? {});
      })
      .catch((error) => {
        throw mapErrorFirestore(error);
      });
  }

  async simpan(grup: Grup, transaction?: Transaction): Promise<Grup> {
    try {
      const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(String(grup.groupId));

      if (transaction) {
        transaction.set(dokumenRef, this.serialize(grup));
        return grup;
      }

      await dokumenRef.set(this.serialize(grup));
      return grup;
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  private serialize(grup: Grup): Record<string, unknown> {
    return {
      groupId: String(grup.groupId),
      telegramChatId: String(grup.telegramChatId),
      createdAt: grup.createdAt,
      status: grup.status,
      activeCaseSessionId: grup.activeCaseSessionId ? String(grup.activeCaseSessionId) : null,
    };
  }

  private deserialize(data: Record<string, unknown>): Grup {
    return {
      groupId: String(data.groupId) as IdGrup,
      telegramChatId: String(data.telegramChatId),
      createdAt: String(data.createdAt) as Grup["createdAt"],
      status: data.status as Grup["status"],
      activeCaseSessionId: typeof data.activeCaseSessionId === "string" ? data.activeCaseSessionId as Grup["activeCaseSessionId"] : undefined,
    };
  }
}
