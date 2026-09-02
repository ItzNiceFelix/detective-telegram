import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import type { App, AppOptions } from "firebase-admin/app";
import { KesalahanKonfigurasi } from "../../fondasi/eror.js";

/**
 * Bootstrap Firebase Admin untuk lingkungan Vercel serverless.
 *
 * Aturan (docs/26-coding-baseline.md, production wiring patch):
 * - Jika FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY tersedia, gunakan kredensial
 *   eksplisit (cert). applicationDefault() HANYA dipakai sebagai fallback ketika
 *   kredensial eksplisit tidak tersedia.
 * - FIREBASE_PRIVATE_KEY multiline dinormalisasi (literal "\n" -> newline nyata).
 * - Credential tidak pernah dicetak ke log.
 * - Validasi gagal dengan pesan jelas ketika credential wajib tidak tersedia.
 */

export interface PengaturanFirebase {
  projectId?: string;
  /** Legacy: paksa pemakaian Application Default Credentials. */
  credentialPath?: string;
  databaseURL?: string;
}

export interface KredensialLayananFirebase {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface BootstrapFirebase {
  projectId?: string;
  /** Tersedia hanya ketika kredensial eksplisit berhasil dibangun. */
  kredensial?: KredensialLayananFirebase;
  pakaiKredensialEksplisit: boolean;
  sumberKredensial: "eksplisit" | "application-default";
}

export type VariabelLingkunganFirebase = Record<string, string | undefined>;

/**
 * Normalisasi private key multiline dari environment variable. Nilai yang
 * diset lewat dashboard (mis. Vercel) sering menyimpan "\n" sebagai dua
 * karakter literal, bukan newline nyata. Fungsi ini murni dan aman dipanggil
 * berulang; tidak pernah mencetak isi kunci.
 */
export function normalisasiPrivateKeyFirebase(kunci: string): string {
  const hasil = kunci
    .trim()
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");

  if (!hasil.includes("PRIVATE KEY")) {
    throw new KesalahanKonfigurasi(
      "FIREBASE_PRIVATE_KEY tidak valid: kunci tidak mengandung blok PRIVATE KEY.",
    );
  }

  return hasil;
}

/**
 * Membangun konfigurasi bootstrap Firebase dari environment variable.
 * Murni (tanpa side effect ke SDK) sehingga mudah diuji.
 */
export function bangunBootstrapFirebase(env: VariabelLingkunganFirebase = process.env): BootstrapFirebase {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyMentah = env.FIREBASE_PRIVATE_KEY;

  const punyaKredensialEksplisit = Boolean(clientEmail && privateKeyMentah && privateKeyMentah.trim().length > 0);

  if (punyaKredensialEksplisit) {
    if (!projectId) {
      throw new KesalahanKonfigurasi(
        "FIREBASE_PROJECT_ID wajib diisi ketika FIREBASE_CLIENT_EMAIL dan FIREBASE_PRIVATE_KEY digunakan.",
      );
    }

    return {
      projectId,
      kredensial: {
        projectId,
        clientEmail: clientEmail as string,
        privateKey: normalisasiPrivateKeyFirebase(privateKeyMentah as string),
      },
      pakaiKredensialEksplisit: true,
      sumberKredensial: "eksplisit",
    };
  }

  // Fallback: Application Default Credentials (hanya bila tersedia).
  const punyaAdc = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);

  if (!punyaAdc) {
    throw new KesalahanKonfigurasi(
      "Credential Firebase tidak tersedia. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
        "dan FIREBASE_PRIVATE_KEY (atau GOOGLE_APPLICATION_CREDENTIALS untuk ADC).",
    );
  }

  return {
    ...(projectId ? { projectId } : {}),
    pakaiKredensialEksplisit: false,
    sumberKredensial: "application-default",
  };
}

export function inisialisasiFirebaseAdmin(
  pengaturan: PengaturanFirebase = {},
  env: VariabelLingkunganFirebase = process.env,
): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const bootstrap = bangunBootstrapFirebase(env);
  const projectId = pengaturan.projectId ?? bootstrap.projectId;

  const konfigurasi: AppOptions = {
    ...(projectId ? { projectId } : {}),
    ...(pengaturan.databaseURL ? { databaseURL: pengaturan.databaseURL } : {}),
  };

  if (bootstrap.kredensial) {
    konfigurasi.credential = cert({
      projectId: bootstrap.kredensial.projectId,
      clientEmail: bootstrap.kredensial.clientEmail,
      privateKey: bootstrap.kredensial.privateKey,
    });
  } else if (!pengaturan.credentialPath) {
    // Tanpa credential eksplisit dan tanpa permintaan ADC eksplisit, bootstrap
    // tetap harus menemukan ADC; bangunBootstrapFirebase sudah memvalidasi.
    konfigurasi.credential = applicationDefault();
  }

  return initializeApp(konfigurasi);
}

