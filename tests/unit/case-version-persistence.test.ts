import test from "node:test";
import assert from "node:assert/strict";

import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { RepositoriVersiKasusFirestore } from "../../src/infrastructure/repositories/firestore/repositori-versi-kasus.js";

const firestoreStub = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({
        caseId: "case-001",
        versionId: "v-001",
        schemaVersion: 1,
        contentHash: "hash-123",
        status: StatusVersiKasus.PUBLISHED,
        metadata: {
          title: "Pembunuhan di Pabrik",
          premise: "Seorang direktur tewas di pabrik.",
          genre: "MISTERI",
          tags: ["misteri", "pabrik"],
          starRating: 4,
        },
        caseBibleRef: "case-bible:case-001:main",
        assetManifestRef: "assets:case-001:v-001:manifest",
        contentSummary: "Versi final yang dipublikasikan.",
        publishedAt: "2026-08-29T00:00:00.000Z",
      }) }),
      set: async () => undefined,
    }),
  }),
} as any;

test("repositori versi kasus memetakan field domain tanpa mengubah aturan business", async () => {
  const repositori = new RepositoriVersiKasusFirestore(firestoreStub);
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

  const hasilSimpan = await repositori.simpanVersiKasus(versi);
  assert.equal(hasilSimpan.caseId, "case-001");
  assert.equal(hasilSimpan.versionId, "v-001");
  assert.equal(hasilSimpan.status, StatusVersiKasus.DRAFT);

  const hasilAmbil = await repositori.ambilVersiKasus("case-001" as any, "v-001" as any);
  assert.notEqual(hasilAmbil, null);
  assert.equal(hasilAmbil?.caseBibleRef, "case-bible:case-001:main");
  assert.equal(hasilAmbil?.assetManifestRef, "assets:case-001:v-001:manifest");
});
