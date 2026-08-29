import { KesalahanIntegrasi } from "../../fondasi/eror.js";

export function mapErrorFirestore(error: unknown): Error {
  if (error instanceof Error) {
    return new KesalahanIntegrasi(`Firestore error: ${error.message}`);
  }

  return new KesalahanIntegrasi("Firestore error tidak diketahui.");
}
