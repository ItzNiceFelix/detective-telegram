import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import type { App, AppOptions } from "firebase-admin/app";

export interface PengaturanFirebase {
  projectId?: string;
  credentialPath?: string;
  databaseURL?: string;
}

export function inisialisasiFirebaseAdmin(pengaturan: PengaturanFirebase = {}): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const konfigurasi: AppOptions = {
    ...(pengaturan.projectId ? { projectId: pengaturan.projectId } : {}),
    ...(pengaturan.credentialPath ? { credential: applicationDefault() } : {}),
    ...(pengaturan.databaseURL ? { databaseURL: pengaturan.databaseURL } : {}),
  };

  return initializeApp(konfigurasi);
}
