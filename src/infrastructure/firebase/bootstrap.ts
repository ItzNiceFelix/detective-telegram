import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { inisialisasiFirebaseAdmin } from "./admin.js";

export interface BootstrapFirestore {
  firestore: Firestore;
}

export function buatBootstrapFirestore(): BootstrapFirestore {
  inisialisasiFirebaseAdmin();
  const firestore = getFirestore();

  return { firestore };
}
