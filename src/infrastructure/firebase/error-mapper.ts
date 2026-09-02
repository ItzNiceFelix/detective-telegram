import { KesalahanAplikasi, KesalahanDomain, KesalahanIntegrasi } from "../../fondasi/eror.js";

export function mapErrorFirestore(error: unknown): Error {
  // Error domain/application yang dilempar dari dalam transaction runner
  // harus lolos apa adanya (mis. KesalahanIdempoten untuk safe replay),
  // jangan diubah menjadi KesalahanIntegrasi.
  if (error instanceof KesalahanDomain || error instanceof KesalahanAplikasi) {
    return error;
  }

  if (error instanceof Error) {
    return new KesalahanIntegrasi(`Firestore error: ${error.message}`);
  }

  return new KesalahanIntegrasi("Firestore error tidak diketahui.");
}

/**
 * Mendeteksi kondisi "dokumen sudah ada" (Firestore ALREADY_EXISTS / kode 6)
 * dari error SDK atau error palsu (fake repository pada test).
 * Tidak pernah melempar — selalu mengembalikan boolean.
 */
export function apakahDokumenSudahAda(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const kandidat = error as { code?: string | number; message?: string };

  if (kandidat.code === 6 || kandidat.code === "already-exists" || kandidat.code === 409) {
    return true;
  }

  return typeof kandidat.message === "string" && kandidat.message.toLowerCase().includes("already exists");
}
