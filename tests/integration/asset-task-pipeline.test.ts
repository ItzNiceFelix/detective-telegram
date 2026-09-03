import test from "node:test";
import assert from "node:assert/strict";

import { buatKomposisiUji } from "./setup-komposisi.js";
import { handlerInternal } from "../../api/admin.js";
import type { KomposisiAplikasi } from "../../src/komposisi/komposisi-aplikasi.js";
import type { VisualPlan } from "../../src/ai/visual-pipeline.js";
import { simpanReferensiAset, type AsetVisual } from "../../src/ai/visual-pipeline.js";
import { buatVersiKasus, StatusVersiKasus, type VersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdKasus, buatIdVersiKasus } from "../../src/fondasi/primitif.js";

const TOKEN = "admin-secret-token-abcdefgh-0123456789ab";
process.env.ADMIN_SECRET_TOKEN = TOKEN;

const CHAT = "-1001";
const ADMIN = "42";
const NONADMIN = "99";
const VAULT_ANGGOTA: Record<string, string> = {
  [`${CHAT}:${ADMIN}`]: "administrator",
  [`${CHAT}:${NONADMIN}`]: "member",
};

type Body = Record<string, unknown>;
function req(action: string, payload: Body = {}): { method: string; headers: Record<string, string>; body: Body } {
  return { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: { action, adminId: "admin-1", payload } };
}

function buatKomposisiVault(): {
  komposisi: KomposisiAplikasi;
  firestore: import("./fake-firestore.js").FirestorePalsu;
  telegram: import("./fake-telegram.js").FetchTelegramPalsu;
} {
  const u = buatKomposisiUji(VAULT_ANGGOTA, { vaultChatId: CHAT });
  return { komposisi: u.komposisi, firestore: u.firestore, telegram: u.telegram };
}

function makPlan(sceneId = "S1", planId = "P1"): VisualPlan {
  return {
    planId,
    sceneId,
    purpose: "CRIME_SCENE",
    requiredClues: [{ id: "CLUE-01", label: "book", entityId: "OBJ-01", kind: "object" }],
    forbiddenClues: [],
    inspectableObjects: ["OBJ-01"],
  };
}

function payloadFoto(
  updateId: number,
  chatId: string,
  userId: string,
  replyMsgId: number,
  fileId: string,
  sizeBytes?: number,
): Record<string, unknown> {
  return {
    update_id: updateId,
    message: {
      message_id: 9000 + updateId,
      chat: { id: Number(chatId), type: "channel" },
      from: { id: Number(userId), username: "admin" },
      photo: [{ file_id: fileId, width: 1280, height: 720, file_size: sizeBytes ?? 120000 }],
      reply_to_message: { message_id: replyMsgId, text: "[ASSET TASK]" },
    },
  };
}

// ===== Submission (valid) =====
test("submission: reply admin yang valid → SUBMITTED + file_id", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-S1");
  const hasil = await submitFoto(komposisi, replyMsgId, "Agada_high", 2);
  assert.equal(hasil.status, "accepted");
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(tugas.status, "SUBMITTED");
  assert.equal(tugas.telegramFileId, "Agada_high");
  assert.equal(tugas.submittedBy, ADMIN);
});

// ===== Submission (invalid / security) =====
test("submission: wrong vault → ignored", async () => {
  const { komposisi } = buatKomposisiVault();
  await alurKirim(komposisi, "CASE-W");
  const kiriman = komposisi.pengirimTelegram.ekstrakKirimanFoto(payloadFoto(3, "-9999", ADMIN, 1, "Agada_x"));
  assert.ok(kiriman);
  const hasil = await komposisi.layananTugasAset.terimaPengirimanAset(kiriman);
  assert.equal(hasil.status, "ignored");
});

test("submission: non-admin → ditolak", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-NA");
  const hasil = await submitFoto(komposisi, replyMsgId, "Agada_na", 4, NONADMIN);
  assert.equal(hasil.status, "rejected");
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.notEqual(tugas.status, "SUBMITTED");
});

test("submission: non-reply → ignored", async () => {
  const { komposisi } = buatKomposisiVault();
  const payload = payloadFoto(5, CHAT, ADMIN, 1, "Agada_nr");
  delete (payload.message as Record<string, unknown>).reply_to_message;
  const kiriman = komposisi.pengirimTelegram.ekstrakKirimanFoto(payload);
  assert.ok(kiriman);
  const hasil = await komposisi.layananTugasAset.terimaPengirimanAset(kiriman);
  assert.equal(hasil.status, "ignored");
});

test("submission: random image (reply ke pesan non-task) → ignored", async () => {
  const { komposisi } = buatKomposisiVault();
  const kiriman = komposisi.pengirimTelegram.ekstrakKirimanFoto(payloadFoto(6, CHAT, ADMIN, 555000, "Agada_rnd"));
  assert.ok(kiriman);
  const hasil = await komposisi.layananTugasAset.terimaPengirimanAset(kiriman);
  assert.equal(hasil.status, "ignored");
  assert.equal(hasil.reason, "reply tanpa AssetTask (random image)");
});

test("submission: oversize image → ditolak", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-OS");
  const kiriman = komposisi.pengirimTelegram.ekstrakKirimanFoto(payloadFoto(7, CHAT, ADMIN, replyMsgId, "Agada_os", 30_000_000));
  assert.ok(kiriman);
  const hasil = await komposisi.layananTugasAset.terimaPengirimanAset(kiriman);
  assert.equal(hasil.status, "rejected");
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.notEqual(tugas.status, "SUBMITTED");
});

test("submission: duplicate update → accepted idempotent, satu task", async () => {
  const { komposisi, firestore } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-DUP");
  await submitFoto(komposisi, replyMsgId, "Agada_dup", 8);
  const ulang = await submitFoto(komposisi, replyMsgId, "Agada_dup", 9);
  assert.equal(ulang.status, "accepted");
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(tugas.status, "SUBMITTED");
  assert.equal(tugas.telegramFileId, "Agada_dup");
  assert.equal(firestore.jumlahDokumen("asset_tasks"), 1);
});

test("submission: resubmit (file_id baru) sebelum verify → mengganti candidate", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-RS");
  await submitFoto(komposisi, replyMsgId, "Agada_v1", 10);
  await submitFoto(komposisi, replyMsgId, "Agada_v2", 11);
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(tugas.status, "SUBMITTED");
  assert.equal(tugas.telegramFileId, "Agada_v2");
});

// ===== Verification =====
test("verification: submit → VERIFIED + asset TELEGRAM_BETA masuk manifest (tanpa binary)", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-V");
  await submitFoto(komposisi, replyMsgId, "Agada_verified", 12);
  const t = await komposisi.layananTugasAset.verifikasiTugasAset(taskId);
  assert.equal(t.status, "VERIFIED");
  assert.ok(t.verifiedAt);

  const manifest = await komposisi.repositoriAsetVisual.ambilManifest("CASE-V");
  assert.ok(manifest);
  const aset = manifest.assets[0];
  assert.ok(aset);
  assert.equal(aset.uri, "Agada_verified");
  assert.equal(aset.storageProvider, "TELEGRAM_BETA");
  assert.equal(aset.durability, "BEST_EFFORT");
  assert.ok(aset.verifiedAt);
  assert.ok(!("bytes" in aset));
});

test("verification: admin handler verifyAssetTask → VERIFIED; duplicate verify idempotent", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-VADM");
  await submitFoto(komposisi, replyMsgId, "Agada_adm", 13);
  const res = await handlerInternal(req("verifyAssetTask", { taskId }), komposisi);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body) as { task: { status: string; verifiedAt: string | null } };
  assert.equal(body.task.status, "VERIFIED");
  assert.ok(body.task.verifiedAt);
  const res2 = await handlerInternal(req("verifyAssetTask", { taskId }), komposisi);
  assert.equal(res2.status, 200);
  const manifest = await komposisi.repositoriAsetVisual.ambilManifest("CASE-VADM");
  assert.equal(manifest?.assets.length, 1);
});

test("verification: verifyAssetTask tanpa taskId → 400", async () => {
  const { komposisi } = buatKomposisiVault();
  const res = await handlerInternal(req("verifyAssetTask", {}), komposisi);
  assert.equal(res.status, 400);
});

// ===== Rejection =====
test("rejection: reject → WAITING_FOR_ADMIN + reason; resubmit memungkinkan", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-RJ");
  await submitFoto(komposisi, replyMsgId, "Agada_rj1", 14);
  const ditolak = await komposisi.layananTugasAset.tolakTugasAset(taskId, "gambar buram, mohon ganti");
  assert.equal(ditolak.status, "WAITING_FOR_ADMIN");
  assert.equal(ditolak.rejectionReason, "gambar buram, mohon ganti");

  const resub = await submitFoto(komposisi, replyMsgId, "Agada_rj2", 15);
  assert.equal(resub.status, "accepted");
  const lagi = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(lagi.status, "SUBMITTED");
  assert.equal(lagi.telegramFileId, "Agada_rj2");
});

test("rejection: admin handler rejectAssetTask → WAITING_FOR_ADMIN", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-RJADM");
  await submitFoto(komposisi, replyMsgId, "Agada_rjadm", 16);
  const res = await handlerInternal(req("rejectAssetTask", { taskId, reason: "low resolution" }), komposisi);
  assert.equal(res.status, 200);
  const t = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(t.status, "WAITING_FOR_ADMIN");
  assert.equal(t.rejectionReason, "low resolution");
});

test("immutable: tidak dapat mengubah/menolak asset VERIFIED", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-IMM");
  await submitFoto(komposisi, replyMsgId, "Agada_imm1", 17);
  await komposisi.layananTugasAset.verifikasiTugasAset(taskId);

  const submitLagi = await submitFoto(komposisi, replyMsgId, "Agada_imm2", 18);
  assert.equal(submitLagi.status, "rejected");
  await assert.rejects(() => komposisi.layananTugasAset.tolakTugasAset(taskId, "x"));
});

async function alurKirim(
  komposisi: KomposisiAplikasi,
  caseId: string,
  caseVersionId = "V1",
  sceneId = "S1",
  planId = "P1",
): Promise<{ taskId: string; replyMsgId: number }> {
  const tugas = await komposisi.layananTugasAset.buatTugasAset(caseId, caseVersionId, makPlan(sceneId, planId));
  const terKirim = await komposisi.layananTugasAset.kirimTugasAset(tugas.taskId);
  return { taskId: terKirim.taskId, replyMsgId: Number(terKirim.telegramMessageId) };
}

async function submitFoto(
  komposisi: KomposisiAplikasi,
  replyMsgId: number,
  fileId: string,
  updateId = 1,
  userId = ADMIN,
) {
  const kiriman = komposisi.pengirimTelegram.ekstrakKirimanFoto(payloadFoto(updateId, CHAT, userId, replyMsgId, fileId));
  assert.ok(kiriman);
  return komposisi.layananTugasAset.terimaPengirimanAset(kiriman);
}

// ===== Task creation =====
test("task: buatTugasAset DRAFT + kirimTugasAset → WAITING_FOR_ADMIN + telegramMessageId tersimpan", async () => {
  const { komposisi } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-T1");
  const tugas = await komposisi.layananTugasAset.ambilTugasAset(taskId);
  assert.equal(tugas.status, "WAITING_FOR_ADMIN");
  assert.equal(tugas.sceneId, "S1");
  assert.equal(tugas.planId, "P1");
  assert.ok(String(replyMsgId).length > 0);
  assert.ok(tugas.prompt.length > 0, "prompt kanonik dari VisualPlan");
});

test("task: dedup buat — identity sama → task kedua tidak dibuat (idempotent)", async () => {
  const { komposisi } = buatKomposisiVault();
  const t1 = await komposisi.layananTugasAset.buatTugasAset("CASE-D", "V1", makPlan());
  const t2 = await komposisi.layananTugasAset.buatTugasAset("CASE-D", "V1", makPlan());
  assert.equal(t1.taskId, t2.taskId);
  const sama = await komposisi.repositoriTugasAset.ambilBerdasarkanIdentitas("CASE-D", "S1", "P1");
  assert.equal(sama?.taskId, t1.taskId);
});

// ===== Helpers publish =====
function versiDraft(caseId: string, opts?: { kandidatAi?: boolean }): VersiKasus {
  return buatVersiKasus({
    caseId: buatIdKasus(caseId),
    versionId: buatIdVersiKasus("V1"),
    schemaVersion: 1,
    metadata: { title: "Case X", premise: "p", genre: "MISTERI", tags: [], starRating: 3 },
    caseBibleRef: `case-bible:${caseId}:golden`,
    assetManifestRef: `assets:${caseId}:V1:manifest`,
    contentSummary: opts?.kandidatAi ? `Generated case: ${caseId}` : "draft",
  });
}

function asetUji(caseId: string, fileId: string, verified?: boolean): AsetVisual {
  return {
    assetId: "ASSET-P1",
    planId: "P1",
    sceneId: "S1",
    caseId,
    provider: "TELEGRAM_BETA",
    uri: fileId,
    status: "READY",
    format: "image/jpeg",
    sizeBytes: 100,
    requiredClues: ["CLUE-01"],
    forbiddenClues: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    storageProvider: "TELEGRAM_BETA",
    durability: "BEST_EFFORT",
    ...(verified ? { verifiedAt: "2026-02-01T00:05:00.000Z" } : {}),
  };
}

// ===== Publish gate =====
test("publish: AI candidate tanpa manifest asset → 422", async () => {
  const { komposisi } = buatKomposisiVault();
  await komposisi.repositoriVersiKasus.simpanVersiKasus(versiDraft("CASE-PU0", { kandidatAi: true }));
  const res = await handlerInternal(req("publishCase", { caseId: "CASE-PU0", versionId: "V1" }), komposisi);
  assert.equal(res.status, 422);
});

test("publish: AI candidate dgn asset belum VERIFIED → 422", async () => {
  const { komposisi } = buatKomposisiVault();
  await komposisi.repositoriVersiKasus.simpanVersiKasus(versiDraft("CASE-PU1", { kandidatAi: true }));
  await simpanReferensiAset(komposisi.repositoriAsetVisual, "CASE-PU1", asetUji("CASE-PU1", "Agada_u", false));
  const res = await handlerInternal(req("publishCase", { caseId: "CASE-PU1", versionId: "V1" }), komposisi);
  assert.equal(res.status, 422);
});

test("publish: AI candidate semua asset VERIFIED → 200", async () => {
  const { komposisi } = buatKomposisiVault();
  const caseId = "CASE-PU2";
  const { taskId, replyMsgId } = await alurKirim(komposisi, caseId);
  await submitFoto(komposisi, replyMsgId, "Agada_pub", 40);
  await komposisi.layananTugasAset.verifikasiTugasAset(taskId);
  await komposisi.repositoriVersiKasus.simpanVersiKasus(versiDraft(caseId, { kandidatAi: true }));
  const res = await handlerInternal(req("publishCase", { caseId, versionId: "V1" }), komposisi);
  assert.equal(res.status, 200);
  const versi = await komposisi.repositoriVersiKasus.ambilVersiKasus(buatIdKasus(caseId), buatIdVersiKasus("V1"));
  assert.equal(versi?.status, StatusVersiKasus.PUBLISHED);
});

test("publish: non-visual case memakai existing path (tanpa manifest) → 200", async () => {
  const { komposisi } = buatKomposisiVault();
  await komposisi.repositoriVersiKasus.simpanVersiKasus(versiDraft("CASE-NV", { kandidatAi: false }));
  const res = await handlerInternal(req("publishCase", { caseId: "CASE-NV", versionId: "V1" }), komposisi);
  assert.equal(res.status, 200);
});

// ===== Replay =====
test("replay: file_id direuse; tanpa getFile / sendPhoto / provider image", async () => {
  const { komposisi, telegram } = buatKomposisiVault();
  const { taskId, replyMsgId } = await alurKirim(komposisi, "CASE-REP");
  await submitFoto(komposisi, replyMsgId, "Agada_rep", 41);
  await komposisi.layananTugasAset.verifikasiTugasAset(taskId);
  const manifest = await komposisi.repositoriAsetVisual.ambilManifest("CASE-REP");
  assert.equal(manifest?.assets[0]?.uri, "Agada_rep");
  const metode = telegram.panggilan.map((p) => p.metode);
  assert.ok(!metode.includes("sendPhoto"), "tidak boleh upload ulang saat replay");
  assert.ok(!metode.includes("getFile"), "tidak boleh memanggil getFile saat replay");
});

// ===== Golden Case asset flow =====
test("golden: AssetTask verified TELEGRAM_BETA tanpa live AI → manifest siap publish", async () => {
  const { komposisi } = buatKomposisiVault();
  const caseId = "GOLDEN-001";
  const { taskId, replyMsgId } = await alurKirim(komposisi, caseId);
  await submitFoto(komposisi, replyMsgId, "Agada_golden", 42);
  const t = await komposisi.layananTugasAset.verifikasiTugasAset(taskId);
  assert.equal(t.status, "VERIFIED");
  const manifest = await komposisi.repositoriAsetVisual.ambilManifest(caseId);
  assert.equal(manifest?.assets[0]?.storageProvider, "TELEGRAM_BETA");
  assert.equal(manifest?.assets[0]?.uri, "Agada_golden");
  const versi = versiDraft(caseId, { kandidatAi: false });
  assert.ok(versi.assetManifestRef.length > 0);
});

// ===== Security =====
test("security: reply ke task lain tidak menyentuh task itu; taskId tak bisa dipalsukan", async () => {
  const { komposisi } = buatKomposisiVault();
  const a = await alurKirim(komposisi, "CASE-MA", "V1", "S1", "P1");
  const b = await alurKirim(komposisi, "CASE-MB", "V1", "S2", "P2");
  await submitFoto(komposisi, b.replyMsgId, "Agada_forB", 43);
  const tugasA = await komposisi.layananTugasAset.ambilTugasAset(a.taskId);
  const tugasB = await komposisi.layananTugasAset.ambilTugasAset(b.taskId);
  assert.equal(tugasA.status, "WAITING_FOR_ADMIN");
  assert.equal(tugasB.status, "SUBMITTED");
  assert.equal(tugasB.telegramFileId, "Agada_forB");

  const fake = komposisi.pengirimTelegram.ekstrakKirimanFoto(payloadFoto(44, CHAT, ADMIN, 111111, "Agada_fake"));
  assert.ok(fake);
  const h = await komposisi.layananTugasAset.terimaPengirimanAset(fake);
  assert.equal(h.status, "ignored");
});