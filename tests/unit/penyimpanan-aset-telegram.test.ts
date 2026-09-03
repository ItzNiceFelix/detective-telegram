import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";

import { FirestorePalsu } from "../integration/fake-firestore.js";
import {
  hasilkanAsetGambar,
  PenyediaGambarPalsu,
  RepositoriAsetVisualMemori,
  simpanReferensiAset,
  type VisualPlan,
} from "../../src/ai/visual-pipeline.js";
import { RepositoriAsetVisualFirestore } from "../../src/infrastructure/repositories/firestore/repositori-aset-visual.js";
import { PenyimpananAsetTelegram } from "../../src/infrastructure/adapters/storage/penyimpanan-aset-telegram.js";
import type { ObyekKirimFotoTelegram, PintuKirimFotoTelegram, TagihanFotoTelegram } from "../../src/infrastructure/adapters/telegram/telegram.js";

/** Fake Telegram: merekam panggilan upload; mengembalikan file_id berurutan. */
class TelegramFotoPalsu implements PintuKirimFotoTelegram {
  calls: Array<{ chatId: string; foto: ObyekKirimFotoTelegram }> = [];
  private count = 0;
  constructor(private readonly base: TagihanFotoTelegram) {}

  async kirimFotoTelegram(chatId: string, foto: ObyekKirimFotoTelegram): Promise<TagihanFotoTelegram> {
    this.calls.push({ chatId, foto });
    this.count += 1;
    return { ...this.base, fileId: `file-${this.count}` };
  }
}

const planUji: VisualPlan = {
  planId: "P-1",
  sceneId: "S-1",
  purpose: "CRIME_SCENE",
  requiredClues: [{ id: "CLUE-01", label: "c", entityId: "E", kind: "evidence" }],
  forbiddenClues: [],
  inspectableObjects: [],
};

function buatStorage(tg: TelegramFotoPalsu): PenyimpananAsetTelegram {
  return new PenyimpananAsetTelegram({ chatId: "-1001", telegram: tg });
}

function keluaranGambar(bytes: Uint8Array): string {
  return JSON.stringify({
    uri: "ignored",
    status: "READY",
    format: "image/png",
    contentType: "image/png",
    sizeBytes: bytes.byteLength,
    bytesBase64: Buffer.from(bytes).toString("base64"),
    requiredClues: ["CLUE-01"],
    forbiddenClues: [],
  });
}

test("simpan → return referensi file_id; ada() true (BEST_EFFORT)", async () => {
  const tg = new TelegramFotoPalsu({ fileId: "", width: 1200, height: 800, sizeBytes: 5 });
  const st = buatStorage(tg);
  const ref = await st.simpan("CASE-1:S-1:P-1", { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });
  assert.equal(ref, "file-1");
  assert.equal(tg.calls.length, 1);
  assert.equal(tg.calls[0]!.chatId, "-1001");
  assert.equal(tg.calls[0]!.foto.contentType, "image/png");
  assert.equal(await st.ada(ref), true);
});

test("simpanTerperinci → storageProvider TELEGRAM_BETA + durability BEST_EFFORT + verified/updated + dimensi", async () => {
  const tg = new TelegramFotoPalsu({ fileId: "", width: 1200, height: 800, sizeBytes: 777 });
  const st = buatStorage(tg);
  const det = await st.simpanTerperinci("CASE-1:S-1:P-1", { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });
  assert.equal(det.storageProvider, "TELEGRAM_BETA");
  assert.equal(det.durability, "BEST_EFFORT");
  assert.ok(det.createdAt);
  assert.equal(det.reference, "file-1");
  assert.equal(det.mimeType, "image/png");
  assert.equal(det.width, 1200);
  assert.equal(det.height, 800);
  assert.equal(det.sizeBytes, 777);
});

test("persistence: pipeline → aset tersimpan dgn reference file_id + metadata penyimpanan (BUKAN binary)", async () => {
  const provider = new PenyediaGambarPalsu([keluaranGambar(new Uint8Array([1, 2, 3, 4]))]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 1200, height: 800, sizeBytes: 4 });
  const repo = new RepositoriAsetVisualMemori();
  const st = buatStorage(tg);

  const aset = await hasilkanAsetGambar("CASE-1", planUji, provider, repo, "gemini", st);

  assert.equal(tg.calls.length, 1);
  assert.ok(aset.uri.startsWith("file-"));
  assert.equal(aset.storageProvider, "TELEGRAM_BETA");
  assert.equal(aset.durability, "BEST_EFFORT");
  assert.ok(aset.verifiedAt);
  assert.ok(aset.updatedAt);
  assert.equal(aset.mimeType, "image/png");
  assert.equal(aset.width, 1200);
  assert.equal(aset.height, 800);
  assert.equal(aset.sizeBytes, 4);

  const kembali = await repo.ambil("CASE-1:S-1:P-1");
  assert.ok(kembali);
  assert.equal(kembali.uri, aset.uri);
  // metadata penyimpanan ikut tersimpan, binary tidak ada di aset.
  assert.ok(!("bytes" in kembali));
  assert.ok(!("bytesBase64" in kembali));
});

test("Firestore round-trip: metadata penyimpanan tersimpan & terbaca; durability BEST_EFFORT; tanpa binary", async () => {
  const db = new FirestorePalsu();
  const repo = new RepositoriAsetVisualFirestore(db as unknown as Firestore);

  const provider = new PenyediaGambarPalsu([keluaranGambar(new Uint8Array([9, 8, 7]))]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 720, height: 480, sizeBytes: 3 });
  const st = buatStorage(tg);
  const aset = await hasilkanAsetGambar("CASE-2", planUji, provider, repo, "gemini", st);

  const kembali = await repo.ambil("CASE-2:S-1:P-1");
  assert.ok(kembali);
  assert.equal(kembali.uri, aset.uri);
  assert.equal(kembali.storageProvider, "TELEGRAM_BETA");
  assert.equal(kembali.durability, "BEST_EFFORT");
  assert.ok(kembali.verifiedAt);
  assert.equal(kembali.width, 720);
  assert.equal(kembali.height, 480);
  assert.ok(!("bytes" in kembali));
});

test("dedup + replay: identity sama → provider tak dipanggil lagi, referensi file_id sama, upload sekali", async () => {
  const provider = new PenyediaGambarPalsu([
    keluaranGambar(new Uint8Array([1, 2, 3, 4])),
    keluaranGambar(new Uint8Array([5, 6, 7, 8])),
  ]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 10, height: 10, sizeBytes: 4 });
  const repo = new RepositoriAsetVisualMemori();
  const st = buatStorage(tg);

  const a1 = await hasilkanAsetGambar("CASE-1", planUji, provider, repo, "gemini", st);
  assert.equal(provider.calls.length, 1);

  // generation kedua (identity sama) → cache hit.
  const a2 = await hasilkanAsetGambar("CASE-1", planUji, provider, repo, "gemini", st);
  assert.equal(provider.calls.length, 1, "provider tidak dipanggil pada cache hit");
  assert.equal(tg.calls.length, 1, "tidak ada upload kedua");
  assert.equal(a2.uri, a1.uri, "referensi file_id yang sama dipakai ulang (replay)");

  const replay = await repo.ambil("CASE-1:S-1:P-1");
  assert.ok(replay);
  assert.equal(replay.uri, a1.uri);
});

test("identity beda case → aset terpisah; provider + upload dipanggil lagi", async () => {
  const provider = new PenyediaGambarPalsu([
    keluaranGambar(new Uint8Array([1])),
    keluaranGambar(new Uint8Array([2])),
  ]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 10, height: 10, sizeBytes: 1 });
  const repo = new RepositoriAsetVisualMemori();
  const st = buatStorage(tg);

  await hasilkanAsetGambar("CASE-A", planUji, provider, repo, "gemini", st);
  await hasilkanAsetGambar("CASE-B", planUji, provider, repo, "gemini", st);
  assert.equal(provider.calls.length, 2);
  assert.equal(tg.calls.length, 2);
  const b = await repo.ambil("CASE-B:S-1:P-1");
  assert.ok(b);
  assert.equal(b.uri, "file-2");
});

test("asset handoff: simpanReferensiAset → manifest memuat aset (ref file_id)", async () => {
  const provider = new PenyediaGambarPalsu([keluaranGambar(new Uint8Array([1]))]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 5, height: 5, sizeBytes: 1 });
  const repo = new RepositoriAsetVisualMemori();
  const st = buatStorage(tg);

  const aset = await hasilkanAsetGambar("CASE-1", planUji, provider, repo, "gemini", st);
  await simpanReferensiAset(repo, "CASE-1", aset);
  const man = await repo.ambilManifest("CASE-1");
  assert.ok(man);
  assert.equal(man.assets.length, 1);
  assert.equal(man.assets[0]!.uri, aset.uri);
});

test("missing asset: repositori.ambil → null utk kunci belum ada", async () => {
  const repo = new RepositoriAsetVisualMemori();
  assert.equal(await repo.ambil("UNKNOWN:S-1:P-1"), null);
});

test("status transisi: aset dapat ditandai UNAVAILABLE/SUSPECT dan tetap terbaca", async () => {
  const provider = new PenyediaGambarPalsu([keluaranGambar(new Uint8Array([1]))]);
  const tg = new TelegramFotoPalsu({ fileId: "", width: 5, height: 5, sizeBytes: 1 });
  const repo = new RepositoriAsetVisualMemori();
  const st = buatStorage(tg);

  const aset = await hasilkanAsetGambar("CASE-1", planUji, provider, repo, "gemini", st);
  aset.status = "UNAVAILABLE";
  aset.updatedAt = new Date().toISOString();
  await repo.simpan(aset);

  const kembali = await repo.ambil("CASE-1:S-1:P-1");
  assert.ok(kembali);
  assert.equal(kembali.status, "UNAVAILABLE");
});