import type { Firestore } from "firebase-admin/firestore";
import type { IdKasus, IdVersiKasus } from "../../../fondasi/primitif.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";
import type { VersiKasus } from "../../../kasus/versi-kasus.js";

export interface KontrakRepositoriVersiKasusFirestore {
  ambilVersiKasus(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null>;
  ambilVersiKasusTerbitan(): Promise<VersiKasus | null>;
  simpanVersiKasus(versi: VersiKasus): Promise<VersiKasus>;
}

export class RepositoriVersiKasusFirestore implements KontrakRepositoriVersiKasusFirestore {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "case_versions";

  ambilVersiKasus(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null> {
    return this.firestore
      .collection(this.namaKoleksi)
      .doc(`${String(caseId)}:${String(versionId)}`)
      .get()
      .then((dokumen) => {
        if (!dokumen.exists) {
          return null;
        }

        return this.deserialize(dokumen.data() ?? {});
      })
      .catch((error) => {
        throw mapErrorFirestore(error);
      });
  }

  ambilVersiKasusTerbitan(): Promise<VersiKasus | null> {
    // Query tertarget: single-field index otomatis pada `status`.
    // Tidak melakukan full collection scan. Untuk closed beta invariant-nya
    // satu published CaseVersion aktif; bila nanti butuh deterministik antar
    // beberapa published version, tambahkan composite index (status, publishedAt).
    return this.firestore
      .collection(this.namaKoleksi)
      .where("status", "==", "PUBLISHED")
      .limit(1)
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          return null;
        }

        const dokumen = snapshot.docs[0];
        if (!dokumen) {
          return null;
        }

        return this.deserialize(dokumen.data() ?? {});
      })
      .catch((error) => {
        throw mapErrorFirestore(error);
      });
  }

  async simpanVersiKasus(versi: VersiKasus): Promise<VersiKasus> {
    try {
      await this.firestore
        .collection(this.namaKoleksi)
        .doc(`${String(versi.caseId)}:${String(versi.versionId)}`)
        .set(this.serialize(versi));
      return versi;
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  private serialize(versi: VersiKasus): Record<string, unknown> {
    return {
      caseId: String(versi.caseId),
      versionId: String(versi.versionId),
      schemaVersion: versi.schemaVersion,
      contentHash: versi.contentHash,
      status: versi.status,
      metadata: {
        title: versi.metadata.title,
        premise: versi.metadata.premise,
        genre: versi.metadata.genre,
        tags: versi.metadata.tags,
        starRating: typeof versi.metadata.starRating === "number" ? versi.metadata.starRating : null,
      },
      caseBibleRef: versi.caseBibleRef,
      assetManifestRef: versi.assetManifestRef,
      contentSummary: versi.contentSummary,
      publishedAt: versi.publishedAt ?? null,
    };
  }

  private deserialize(data: Record<string, unknown>): VersiKasus {
    const metadata = data.metadata as Record<string, unknown> | undefined;

    return {
      caseId: String(data.caseId) as IdKasus,
      versionId: String(data.versionId) as IdVersiKasus,
      schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
      contentHash: typeof data.contentHash === "string" ? data.contentHash : "",
      status: (data.status as VersiKasus["status"]) ?? "DRAFT",
      metadata: {
        title: typeof metadata?.title === "string" ? metadata.title : "",
        premise: typeof metadata?.premise === "string" ? metadata.premise : "",
        genre: typeof metadata?.genre === "string" ? metadata.genre : "",
        tags: Array.isArray(metadata?.tags) ? metadata.tags.map(String) : [],
        starRating: typeof metadata?.starRating === "number" ? (metadata.starRating as 1 | 2 | 3 | 4 | 5) : undefined,
      },
      caseBibleRef: typeof data.caseBibleRef === "string" ? data.caseBibleRef : "",
      assetManifestRef: typeof data.assetManifestRef === "string" ? data.assetManifestRef : "",
      contentSummary: typeof data.contentSummary === "string" ? data.contentSummary : "",
      publishedAt: typeof data.publishedAt === "string" ? data.publishedAt as VersiKasus["publishedAt"] : undefined,
    };
  }
}
