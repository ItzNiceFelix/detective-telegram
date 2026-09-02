import test from "node:test";
import assert from "node:assert/strict";

import type { Firestore } from "firebase-admin/firestore";
import { RepositoriVersiKasusFirestore } from "../../src/infrastructure/repositories/firestore/repositori-versi-kasus.js";
import { buatVersiKasusEmasTerbitan } from "./fake-telegram.js";
import { FirestorePalsu } from "./fake-firestore.js";
import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdKasus, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { buatKomposisiUji, seedVersiKasusTerbitan } from "./setup-komposisi.js";

test("ambilVersiKasusTerbitan memakai query where status=PUBLISHED (bukan full scan)", async () => {
  const firestore = new FirestorePalsu();
  const repositori = new RepositoriVersiKasusFirestore(firestore as unknown as Firestore);

  // Draft TIDAK boleh terpilih; published harus terpilih.
  await repositori.simpanVersiKasus(
    buatVersiKasus({
      caseId: buatIdKasus("CASE-DRAFT"),
      versionId: buatIdVersiKasus("V1"),
      schemaVersion: 1,
      metadata: { title: "Draft", premise: "p", genre: "MISTERI", tags: [] },
      caseBibleRef: "bible:case-draft",
      assetManifestRef: "assets:draft",
      contentSummary: "draft",
      status: StatusVersiKasus.DRAFT,
    }),
  );

  const versiTerbitan = buatVersiKasusEmasTerbitan();
  await repositori.simpanVersiKasus(versiTerbitan);

  const hasil = await repositori.ambilVersiKasusTerbitan();
  assert.ok(hasil);
  assert.equal(hasil.caseId, versiTerbitan.caseId);
  assert.equal(hasil.status, StatusVersiKasus.PUBLISHED);
});

test("ambilVersiKasusTerbitan mengembalikan null bila tidak ada published", async () => {
  const { firestore, komposisi } = buatKomposisiUji();
  await komposisi.repositoriVersiKasus.simpanVersiKasus(
    buatVersiKasus({
      caseId: buatIdKasus("CASE-X"),
      versionId: buatIdVersiKasus("V1"),
      schemaVersion: 1,
      metadata: { title: "X", premise: "p", genre: "MISTERI", tags: [] },
      caseBibleRef: "bible:x",
      assetManifestRef: "assets:x",
      contentSummary: "x",
      status: StatusVersiKasus.DRAFT,
    }),
  );

  const hasil = await komposisi.repositoriVersiKasus.ambilVersiKasusTerbitan();
  assert.equal(hasil, null);
  assert.ok(firestore.jumlahDokumen("case_versions") > 0, "draft ada tapi tidak dipilih");
});

test("seedVersiKasusTerbitan menyediakan published Golden Case untuk smoke/integration", async () => {
  const { komposisi } = buatKomposisiUji();
  const versi = await seedVersiKasusTerbitan(komposisi);

  assert.equal(versi.status, StatusVersiKasus.PUBLISHED);
  assert.ok(versi.publishedAt);
  assert.ok(versi.metadata.title.length > 0);
});