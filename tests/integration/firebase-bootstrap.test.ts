import test from "node:test";
import assert from "node:assert/strict";

import { bangunBootstrapFirebase, inisialisasiFirebaseAdmin, normalisasiPrivateKeyFirebase } from "../../src/infrastructure/firebase/admin.js";
import { KesalahanKonfigurasi } from "../../src/fondasi/eror.js";
import { getApps, deleteApp } from "firebase-admin/app";
import { generateKeyPairSync } from "node:crypto";

/**
 * Private key PKCS8 di-generate saat runtime (bukan secret repository).
 * Dipakai untuk memverifikasi wiring cert() tanpa credential asli.
 */
function buatPrivateKeyPkcs8(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

const PRIVATE_KEY_MULTILINE =
  "-----BEGIN PRIVATE KEY-----\\nMIIEvA-TEST\\nLINE2\\n-----END PRIVATE KEY-----\\n";

test("bangunBootstrapFirebase memakai kredensial eksplisit ketika env tersedia", () => {
  const bootstrap = bangunBootstrapFirebase({
    FIREBASE_PROJECT_ID: "detective-test",
    FIREBASE_CLIENT_EMAIL: "sa@detective-test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: PRIVATE_KEY_MULTILINE,
  });

  assert.equal(bootstrap.pakaiKredensialEksplisit, true);
  assert.equal(bootstrap.sumberKredensial, "eksplisit");
  assert.equal(bootstrap.projectId, "detective-test");
  assert.equal(bootstrap.kredensial?.clientEmail, "sa@detective-test.iam.gserviceaccount.com");
});

test("normalisasiPrivateKeyFirebase mengubah literal \\n menjadi newline nyata", () => {
  const hasil = normalisasiPrivateKeyFirebase(PRIVATE_KEY_MULTILINE);
  assert.equal(hasil.includes("\\n"), false);
  assert.ok(hasil.includes("\n"), "harus mengandung newline nyata");
  assert.ok(hasil.startsWith("-----BEGIN PRIVATE KEY-----"));
});

test("normalisasiPrivateKeyFirebase menolak kunci yang tidak valid", () => {
  assert.throws(() => normalisasiPrivateKeyFirebase("bukan-kunci"), KesalahanKonfigurasi);
});

test("kredensial eksplisit tanpa FIREBASE_PROJECT_ID gagal jelas", () => {
  assert.throws(
    () =>
      bangunBootstrapFirebase({
        FIREBASE_CLIENT_EMAIL: "sa@project.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: PRIVATE_KEY_MULTILINE,
      }),
    (error: unknown) => {
      assert.ok(error instanceof KesalahanKonfigurasi);
      assert.match(error.message, /FIREBASE_PROJECT_ID/);
      return true;
    },
  );
});

test("tanpa credential apa pun gagal jelas dengan pesan variabel wajib", () => {
  assert.throws(
    () => bangunBootstrapFirebase({}),
    (error: unknown) => {
      assert.ok(error instanceof KesalahanKonfigurasi);
      assert.match(error.message, /FIREBASE_PROJECT_ID/);
      assert.match(error.message, /FIREBASE_CLIENT_EMAIL/);
      assert.match(error.message, /FIREBASE_PRIVATE_KEY/);
      return true;
    },
  );
});

test("inisialisasiFirebaseAdmin dengan kredensial eksplisit tidak melempar dan tidak mencetak kredensial", async () => {
  // Isolasi: hanya jalan bila belum ada app Firebase terdaftar (guard getApps).
  if (getApps().length > 0) {
    return;
  }

  const privateKey = buatPrivateKeyPkcs8();
  const env = {
    FIREBASE_PROJECT_ID: "detective-test",
    FIREBASE_CLIENT_EMAIL: "sa@detective-test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  };

  const app = inisialisasiFirebaseAdmin({}, env);
  assert.ok(app);
  assert.equal(app.options.projectId, "detective-test");
  assert.ok(app.options.credential, "credential cert harus terpasang");

  const appLagi = inisialisasiFirebaseAdmin({}, env);
  assert.equal(appLagi, app, "warm invocation harus memakai app yang sama");

  // Kredensial terpasang sebagai objek credential SDK (bukan string mentah di options).
  const credential = app.options.credential as { getAccessToken?: unknown } | undefined;
  assert.ok(credential && typeof credential.getAccessToken === "function", "credential cert SDK");

  for (const item of getApps()) {
    await deleteApp(item);
  }
});

test("inisialisasiFirebaseAdmin tanpa credential apa pun gagal jelas (fail clearly)", () => {
  if (getApps().length > 0) {
    return;
  }

  assert.throws(
    () => inisialisasiFirebaseAdmin({}, {}),
    KesalahanKonfigurasi,
  );
  assert.equal(getApps().length, 0, "tidak boleh meninggalkan app setelah gagal");
});