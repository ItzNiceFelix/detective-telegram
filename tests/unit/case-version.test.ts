import test from "node:test";
import assert from "node:assert/strict";

import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatWaktuIso } from "../../src/fondasi/primitif.js";
import { StatusVersiKasus, buatVersiKasus, publikasiVersiKasus, validasiVersiKasus } from "../../src/kasus/versi-kasus.js";

const contohVersiKasus = () => ({
  caseId: "case-001" as any,
  versionId: "v-001" as any,
  schemaVersion: 1,
  contentHash: "hash-123",
  status: StatusVersiKasus.DRAFT,
  metadata: {
    title: "Pembunuhan di Pabrik",
    premise: "Seorang direktur tewas di pabrik pada malam hujan.",
    genre: "MISTERI",
    tags: ["misteri", "pabrik", "kecurigaan"],
    starRating: 4 as const,
  },
  caseBibleRef: "case-bible:case-001:main",
  assetManifestRef: "assets:case-001:v-001:manifest",
  contentSummary: "Versi draft dengan timeline dan bukti dasar.",
});

test("validasi versi kasus menerima draft yang memenuhi kontrak", () => {
  const versi = contohVersiKasus();

  assert.doesNotThrow(() => validasiVersiKasus(versi));
  assert.equal(versi.status, StatusVersiKasus.DRAFT);
});

test("factory membuat versi kasus dengan status draft dan hash siap publish", () => {
  const versi = buatVersiKasus({
    caseId: "case-001" as any,
    versionId: "v-001" as any,
    schemaVersion: 1,
    metadata: {
      title: "Pembunuhan di Pabrik",
      premise: "Direktur tewas pada malam hujan.",
      genre: "MISTERI",
      tags: ["misteri", "pabrik"],
      starRating: 5,
    },
    caseBibleRef: "case-bible:case-001:main",
    assetManifestRef: "assets:case-001:v-001:manifest",
    contentSummary: "Ringkasan penuh case.",
  });

  assert.equal(versi.status, StatusVersiKasus.DRAFT);
  assert.ok(versi.contentHash.length > 0);
  assert.equal(versi.schemaVersion, 1);
});

test("publikasi versi kasus mengunci status dan timestamp publikasi", () => {
  const versi = contohVersiKasus();
  const hasil = publikasiVersiKasus(versi, buatWaktuIso("2026-08-29T00:00:00.000Z"));

  assert.equal(hasil.status, StatusVersiKasus.PUBLISHED);
  assert.equal(hasil.publishedAt, "2026-08-29T00:00:00.000Z");
  assert.ok(hasil.contentHash.length > 0);
});

test("versi kasus yang sudah published tidak dapat diubah kembali", () => {
  const versi = publikasiVersiKasus(contohVersiKasus(), buatWaktuIso("2026-08-29T00:00:00.000Z"));

  assert.throws(
    () => publikasiVersiKasus(versi, buatWaktuIso("2026-08-29T00:01:00.000Z")),
    KesalahanValidasi,
  );
});

test("validasi menolak case version yang tidak memiliki bible reference atau manifest", () => {
  const versi = contohVersiKasus();
  delete (versi as any).caseBibleRef;

  assert.throws(() => validasiVersiKasus(versi), KesalahanValidasi);
});
