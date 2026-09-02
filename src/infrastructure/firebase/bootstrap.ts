import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { inisialisasiFirebaseAdmin } from "./admin.js";

export interface BootstrapFirestore {
  firestore: Firestore;
}

/**
 * Bootstrap Firestore untuk runtime Vercel. Aman dipanggil berulang pada warm
 * invocation: inisialisasiFirebaseAdmin menggunakan getApps() guard sehingga
 * tidak membuat koneksi/app baru.
 */
export function buatBootstrapFirestore(env: Record<string, string | undefined> = process.env): BootstrapFirestore {
  inisialisasiFirebaseAdmin({}, env);
  const firestore = getFirestore();

  return { firestore };
}
