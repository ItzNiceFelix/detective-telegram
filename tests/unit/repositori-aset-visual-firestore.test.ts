import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";

import { FirestorePalsu } from "../integration/fake-firestore.js";
import { RepositoriAsetVisualFirestore } from "../../src/infrastructure/repositories/firestore/repositori-aset-visual.js";
import type { AsetVisual, ManifestAsetVisual, VisualPlan } from "../../src/ai/visual-pipeline.js";

const planUji: VisualPlan = {
  planId: "PLAN-01",
  sceneId: "SCENE_01",
  purpose: "CRIME_SCENE",
  requiredClues: [{ id: "CLUE-01", label: "Glass shard", entityId: "E01", kind: "evidence" }],
  forbiddenClues: [],
  inspectableObjects: [],
};

function asetUji(): AsetVisual {
  return {
    assetId: "ASSET-PLAN-01",
    planId: "PLAN-01",
    sceneId: "SCENE_01",
    caseId: "CASE-1",
    provider: "gemini-image",
    uri: "asset://gemini/model/CASE-1/SCENE_01/PLAN-01",
    status: "NEEDS_REVIEW",
    format: "image/png",
    sizeBytes: 150000,
    requiredClues: ["CLUE-01"],
    forbiddenClues: [],
    verifyNotes: ["menunggu review manusia"],
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function buatRepo(): RepositoriAsetVisualFirestore {
  return new RepositoriAsetVisualFirestore(new FirestorePalsu() as unknown as Firestore);
}

test("kunci dedup = caseId:sceneId:planId (identitas stabil, bukan hasil parsing clue)", () => {
  const repo = buatRepo();
  assert.equal(repo.ambilKunci(planUji, "CASE-1"), "CASE-1:SCENE_01:PLAN-01");
});

test("simpan/ambil: aset persisten di bawah kunci stabil (round-trip durabel)", async () => {
  const db = new FirestorePalsu();
  const repo = new RepositoriAsetVisualFirestore(db as unknown as Firestore);

  await repo.simpan(asetUji());
  assert.equal(db.jumlahDokumen("visual_assets"), 1);

  const kembali = await repo.ambil("CASE-1:SCENE_01:PLAN-01");
  assert.ok(kembali);
  assert.equal(kembali.assetId, "ASSET-PLAN-01");
  assert.equal(kembali.uri, asetUji().uri);
  assert.equal(kembali.status, "NEEDS_REVIEW");
  assert.equal(kembali.provider, "gemini-image");
  assert.deepEqual(kembali.requiredClues, ["CLUE-01"]);
});

test("simpan ulang kunci yang sama → overwrite (dedup lintas replay, tetap satu dokumen)", async () => {
  const db = new FirestorePalsu();
  const repo = new RepositoriAsetVisualFirestore(db as unknown as Firestore);

  await repo.simpan(asetUji());
  await repo.simpan({ ...asetUji(), sizeBytes: 200000 });

  assert.equal(db.jumlahDokumen("visual_assets"), 1);
  const kembali = await repo.ambil("CASE-1:SCENE_01:PLAN-01");
  assert.equal(kembali?.sizeBytes, 200000);
});

test("ambil: kunci tidak valid / belum ada → null", async () => {
  const repo = buatRepo();
  assert.equal(await repo.ambil("tanpa-pemisah"), null);
  assert.equal(await repo.ambil(""), null);
  assert.equal(await repo.ambil("CASE-X:SCENE_X:PLAN_X"), null);
});

test("manifest: round-trip; null bila belum ada", async () => {
  const db = new FirestorePalsu();
  const repo = new RepositoriAsetVisualFirestore(db as unknown as Firestore);

  assert.equal(await repo.ambilManifest("CASE-1"), null);

  const manifest: ManifestAsetVisual = {
    manifestId: "manifest-CASE-1",
    caseId: "CASE-1",
    assets: [asetUji()],
    generatedAt: "2026-09-01T00:00:00.000Z",
    version: 2,
  };
  await repo.simpanManifest(manifest);
  assert.equal(db.jumlahDokumen("visual_asset_manifests"), 1);

  const kembali = await repo.ambilManifest("CASE-1");
  assert.ok(kembali);
  assert.equal(kembali.manifestId, "manifest-CASE-1");
  assert.equal(kembali.caseId, "CASE-1");
  assert.equal(kembali.version, 2);
  assert.equal(kembali.assets.length, 1);
  assert.equal(kembali.assets[0]?.assetId, "ASSET-PLAN-01");
  assert.equal(kembali.assets[0]?.status, "NEEDS_REVIEW");
});