import test from "node:test";
import assert from "node:assert/strict";

import { handlerInternal } from "../../api/admin.js";
import { buatKomposisiUji, type KomposisiUji } from "./setup-komposisi.js";
import { buatVersiKasus, type VersiKasus } from "../../src/kasus/versi-kasus.js";
import { buatIdGrup, buatIdKasus, buatIdSesiKasus, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import type { SesiKasus, Grup } from "../../src/domain/entities.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { simpanReferensiAset, type AsetVisual } from "../../src/ai/visual-pipeline.js";

const TOKEN = "admin-secret-token-abcdefgh-0123456789";
process.env.ADMIN_SECRET_TOKEN = TOKEN;

const CHAT = "-1001";
const WAKTU = buatWaktuIso("2026-02-01T00:00:00.000Z");

type Body = Record<string, unknown>;

function req(action: string, payload: Body = {}): { method: string; headers: Record<string, string>; body: Body } {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: { action, adminId: "admin-1", payload },
  };
}

function buatDraft(caseId: string, versionId: string): VersiKasus {
  return buatVersiKasus({
    caseId: buatIdKasus(caseId),
    versionId: buatIdVersiKasus(versionId),
    schemaVersion: 1,
    metadata: { title: "Case X", premise: "premise", genre: "MISTERI", tags: [], starRating: 3 },
    caseBibleRef: `case-bible:${caseId}:golden`,
    assetManifestRef: `assets:${caseId}:${versionId}:manifest`,
    contentSummary: "draft",
  });
}

function buatSesi(status: StatusSesi, extra: Partial<SesiKasus> = {}): SesiKasus {
  return {
    sessionId: buatIdSesiKasus("admin-session-1"),
    caseId: "CASE-X" as never,
    caseVersionId: "V9" as never,
    groupId: buatIdGrup(CHAT),
    status,
    outcome: null,
    playerIds: [],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: WAKTU,
    ...extra,
  };
}

async function simpanSesi(komposisi: KomposisiUji["komposisi"], sesi: SesiKasus): Promise<void> {
  await komposisi.repositoriGrup.simpan({
    groupId: buatIdGrup(CHAT),
    telegramChatId: CHAT,
    createdAt: WAKTU,
    status: "ACTIVE",
    activeCaseSessionId: sesi.sessionId,
  } as Grup);
  await komposisi.repositoriSesiKasus.simpan(sesi);
}

function buatAsetUji(caseId: string): AsetVisual {
  return {
    assetId: `asset-${caseId}-s1-p1`,
    planId: "plan-s1-p1",
    sceneId: "S1",
    caseId,
    provider: "gemini",
    uri: `asset://memori/${caseId}/S1.png`,
    status: "READY",
    format: "image/png",
    sizeBytes: 100,
    requiredClues: [],
    forbiddenClues: [],
    createdAt: "2026-02-01T00:00:00.000Z",
  };
}

test("BLOCKER 4 — tanpa token → 401 dan tidak ada mutasi", async () => {
  const { komposisi } = buatKomposisiUji({});

  const hasil = await handlerInternal({ method: "POST", headers: {}, body: req("forceArchive", { sessionId: "admin-session-1" }).body }, komposisi);
  assert.equal(hasil.status, 401);
  assert.ok(!JSON.stringify(hasil).includes(TOKEN));
});

test("BLOCKER 4 — healthDiagnostic tidak membocorkan secret", async () => {
  const { komposisi } = buatKomposisiUji({});
  const hasil = await handlerInternal(req("healthDiagnostic"), komposisi);
  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { checks: Record<string, unknown> };
  assert.equal(body.checks.admin, true);
  assert.ok(!hasil.body.includes(TOKEN));
});

test("BLOCKER 4 — publishCase: DRAFT → PUBLISHED, idempotent, non-existent → 404", async () => {
  const { komposisi } = buatKomposisiUji({});
  await komposisi.repositoriVersiKasus.simpanVersiKasus(buatDraft("CASE-X", "V9"));

  const pertama = await handlerInternal(req("publishCase", { caseId: "CASE-X", versionId: "V9" }), komposisi);
  assert.equal(pertama.status, 200);
  const p1 = JSON.parse(pertama.body) as { published: { status: string } };
  assert.equal(p1.published.status, "PUBLISHED");

  const kedua = await handlerInternal(req("publishCase", { caseId: "CASE-X", versionId: "V9" }), komposisi);
  assert.equal(kedua.status, 200);

  const notFound = await handlerInternal(req("publishCase", { caseId: "CASE-000", versionId: "V1" }), komposisi);
  assert.equal(notFound.status, 404);
});
test("BLOCKER 4 — publishCase: kandidat AI tanpa asset durable → 422; dengan asset → 200", async () => {
  const { komposisi } = buatKomposisiUji({});
  const draftAi: VersiKasus = {
    ...buatDraft("CASE-AI", "V1"),
    contentSummary: "Generated case: Golden Heist — kandidat AI",
  };
  await komposisi.repositoriVersiKasus.simpanVersiKasus(draftAi);

  // 1) Kandidat AI tanpa mandatory asset durable → publish DITOLAK (Part C).
  const tanpaAsset = await handlerInternal(req("publishCase", { caseId: "CASE-AI", versionId: "V1" }), komposisi);
  assert.equal(tanpaAsset.status, 422);

  // 2) Setelah asset durable di-seed → publish berhasil 200.
  await simpanReferensiAset(komposisi.repositoriAsetVisual, "CASE-AI", buatAsetUji("CASE-AI"));
  const denganAsset = await handlerInternal(req("publishCase", { caseId: "CASE-AI", versionId: "V1" }), komposisi);
  assert.equal(denganAsset.status, 200);
  const body = JSON.parse(denganAsset.body) as { published: { status: string } };
  assert.equal(body.published.status, "PUBLISHED");
});
test("BLOCKER 4 — inspectSession read-only", async () => {
  const { komposisi } = buatKomposisiUji({});
  await simpanSesi(komposisi, buatSesi(StatusSesi.OPEN, { score: 7 }));

  const hasil = await handlerInternal(req("inspectSession", { sessionId: "admin-session-1" }), komposisi);
  assert.equal(hasil.status, 200);
  const body = JSON.parse(hasil.body) as { session: { status: string; score: number } };
  assert.equal(body.session.status, "OPEN");
  assert.equal(body.session.score, 7);

  const nf = await handlerInternal(req("inspectSession", { sessionId: "tidak-ada" }), komposisi);
  assert.equal(nf.status, 404);
});

test("BLOCKER 4 — forceArchive: PAUSED → ARCHIVED; OPEN ditolak state machine", async () => {
  const { komposisi } = buatKomposisiUji({});
  await simpanSesi(komposisi, buatSesi(StatusSesi.PAUSED));

  const arsip = await handlerInternal(req("forceArchive", { sessionId: "admin-session-1" }), komposisi);
  assert.equal(arsip.status, 200);
  const body = JSON.parse(arsip.body) as { archived: { status: string } };
  assert.equal(body.archived.status, "ARCHIVED");

  const uji2 = buatKomposisiUji({});
  await simpanSesi(uji2.komposisi, buatSesi(StatusSesi.OPEN));
  const open = await handlerInternal(req("forceArchive", { sessionId: "admin-session-1" }), uji2.komposisi);
  assert.equal(open.status, 422);
});

test("BLOCKER 4 — rejectCandidate no-op terdokumentasi; regenerateCase tidak didukung", async () => {
  const { komposisi } = buatKomposisiUji({});

  // rejectCandidate: kandidat yang gagal validasi TIDAK PERNAH dipublish (publish
  // gate deterministik) → endpoint adalah guard terdokumentasi, bukan mutasi.
  const reject = await handlerInternal(req("rejectCandidate", { caseId: "CASE-X", versionId: "V9" }), komposisi);
  assert.equal(reject.status, 200);
  const bodyReject = JSON.parse(reject.body) as { ok: boolean; message: string };
  assert.equal(bodyReject.ok, true);
  assert.ok(bodyReject.message.length > 0);

  const regen = await handlerInternal(req("regenerateCase", { caseId: "CASE-X" }), komposisi);
  assert.equal(regen.status, 400);
  assert.equal(JSON.parse(regen.body).error, "unsupported admin action");
});

test("BLOCKER 4 — action tidak dikenal → 400 (bukan endpoint bebas / arbitrary mutation)", async () => {
  const { komposisi } = buatKomposisiUji({});
  const hasil = await handlerInternal(req("hapusSemuaFirestore", { doc: "apa_saja" }), komposisi);
  assert.equal(hasil.status, 400);
});