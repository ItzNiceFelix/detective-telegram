import { getStorage } from "firebase-admin/storage";
import type { KontrakPenyimpananGambar, ObyekGambarTersimpan } from "../../../ai/visual-pipeline.js";

/**
 * Object storage DURABLE untuk binary image, dibalut Firebase Storage
 * (`firebase-admin/storage` → `@google-cloud/storage`, sudah ter-install sebagai
 * optional dependency firebase-admin — TIDAK ada dependency baru).
 *
 * - Reuse credensial Firebase yang sama dengan Firestore (project/bucket).
 * - `getStorage()` dipanggil LAZY (baru saat simpan/ada dipakai) sehingga aman
 *   diinjeksi tanpa app bootstrap (test). Firestore tetap hanya metadata/ref
 *   (VISUAL_02/03); binary ada di object storage, BUKAN di Firestore.
 * - URI durable yang dikembalikan adalah `gs://bucket/objectPath` — stabil dan
 *   BUKAN signed URL (bukan secret; tidak pernah di-log).
 */
export interface OpsiPenyimpananGambarFirebase {
  /** Nama bucket Firebase Storage; default bucket project bila dikosongkan. */
  bucket?: string | undefined;
  /** Prefix object path (dicoret oleh sanitizer). Default: `assets/cases`. */
  prefix?: string | undefined;
}

export class PenyimpananGambarFirebase implements KontrakPenyimpananGambar {
  private readonly opsi: OpsiPenyimpananGambarFirebase;

  constructor(opsi: OpsiPenyimpananGambarFirebase = {}) {
    this.opsi = opsi;
  }

  private bucket() {
    const storage = getStorage();
    return this.opsi.bucket ? storage.bucket(this.opsi.bucket) : storage.bucket();
  }

  /** Sanitasi kunci `caseId:sceneId:planId` → path object yang aman. */
  private sanitasiKunci(kunci: string): string {
    const segmen = kunci
      .split(":")
      .map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, "_") || "_");
    const prefix = (this.opsi.prefix ?? "assets/cases").replace(/\/+$/g, "");
    return [prefix, ...segmen].join("/") + ".png";
  }

  async simpan(kunci: string, obyek: ObyekGambarTersimpan): Promise<string> {
    const file = this.bucket().file(this.sanitasiKunci(kunci));
    await file.save(Buffer.from(obyek.bytes), {
      contentType: obyek.contentType,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });
    return `gs://${file.bucket.name}/${file.name}`;
  }

  async ada(uri: string): Promise<boolean> {
    const cocok = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);
    if (!cocok) {
      return false;
    }
    const bucketNama = cocok[1];
    const objectPath = cocok[2];
    if (!bucketNama || !objectPath) {
      return false;
    }
    // Bukan object milik bucket yang dikonfigurasi → dianggap tidak ada.
    if (this.opsi.bucket && this.opsi.bucket !== bucketNama) {
      return false;
    }
    const file = this.bucket().file(objectPath);
    try {
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }
}