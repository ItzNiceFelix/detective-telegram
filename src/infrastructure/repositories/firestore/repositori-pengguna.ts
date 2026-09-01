import type { Firestore } from "firebase-admin/firestore";
import type { Pengguna } from "../../../domain/entities.js";
import type { IdPemain } from "../../../fondasi/primitif.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";

export interface KontrakRepositoriPenggunaFirestore {
  ambil(userId: IdPemain): Promise<Pengguna | null>;
  simpan(pengguna: Pengguna): Promise<Pengguna>;
}

export class RepositoriPenggunaFirestore implements KontrakRepositoriPenggunaFirestore {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "users";

  ambil(userId: IdPemain): Promise<Pengguna | null> {
    return this.firestore
      .collection(this.namaKoleksi)
      .doc(String(userId))
      .get()
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

  async simpan(pengguna: Pengguna): Promise<Pengguna> {
    try {
      await this.firestore.collection(this.namaKoleksi).doc(String(pengguna.userId)).set(this.serialize(pengguna));
      return pengguna;
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  private serialize(pengguna: Pengguna): Record<string, unknown> {
    return {
      userId: String(pengguna.userId),
      telegramUserId: String(pengguna.telegramUserId),
      usernameSnapshot: pengguna.usernameSnapshot ?? null,
      language: pengguna.language,
      createdAt: pengguna.createdAt,
      lastActiveAt: pengguna.lastActiveAt ?? null,
    };
  }

  private deserialize(data: Record<string, unknown>): Pengguna {
    return {
      userId: String(data.userId) as IdPemain,
      telegramUserId: String(data.telegramUserId),
      usernameSnapshot: typeof data.usernameSnapshot === "string" ? data.usernameSnapshot : undefined,
      language: String(data.language),
      createdAt: String(data.createdAt) as Pengguna["createdAt"],
      lastActiveAt: typeof data.lastActiveAt === "string" ? data.lastActiveAt as Pengguna["lastActiveAt"] : undefined,
    };
  }
}
