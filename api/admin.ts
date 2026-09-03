import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validasiAdminToken, validasiInputTelegram } from "../src/security/audit.js";
import { PenghitungBatasKejadian } from "../src/security/rate-limiter.js";
import { dapatkanKomposisiAplikasi, type KomposisiAplikasi } from "../src/komposisi/komposisi-aplikasi.js";
import { publikasiVersiKasus, StatusVersiKasus, type VersiKasus } from "../src/kasus/versi-kasus.js";
import { arsipkanSesi } from "../src/domain/services/transisi-sesi.js";
import type { SesiKasus } from "../src/domain/entities.js";
import { StatusSesi } from "../src/domain/enums.js";
import { buatIdKasus, buatIdSesiKasus, buatIdVersiKasus } from "../src/fondasi/primitif.js";
import { KesalahanProviderAi } from "../src/ai/errors.js";
import type { BenihKasus } from "../src/kasus/generasi-kasus.js";
import type { VisualPlan } from "../src/ai/visual-pipeline.js";


interface PermintaanHttpAdmin {
  method?: string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Record<string, unknown> | null;
}

interface ResponHttpAdmin {
  status: number;
  body: string;
}

/**
 * Admin scope ketat untuk beta (BLOCKER 4) — hanya operasi yang diwajibkan
 * existing specification:
 * - publishCase      : satu-satunya cara DRAFT -> PUBLISHED tanpa mutasi Firestore
 *                      manual (offline/admin build process, docs/26.15).
 * - inspectSession   : read-only diagnostik sesi (opsional untuk beta).
 * - forceArchive     : operasional — arsipkan sesi stuck, mengikuti state machine.
 * - healthDiagnostic : status tanpa membocorkan secret.
 * - generateCase    : AI case generation (ADMIN/OFFLINE only; provider dari
 *                     config; publish hanya lewat publish gate deterministik).
 * - generateImages  : AI image generation (ADMIN/OFFLINE only; metadata/ref
 *                     durable, BUKAN binary - lihat VISUAL_02/03).
 * - rejectCandidate : guard terdokumentasi (no-op) - kandidat yang gagal validasi
 *                     TIDAK PERNAH dipublish; tidak ada mutasi di sini.
 * - regenerateCase  : belum diimplementasikan -> 400 unsupported admin action.
 *
 * Keamanan: authenticated + authorized + auditable; tidak pernah membocorkan
 * secret/token ke response atau log; TIDAK ada arbitrary Firestore mutation.
 */
async function handlerInternal(request: PermintaanHttpAdmin = {}, komposisi?: KomposisiAplikasi): Promise<ResponHttpAdmin> {
  const method = request.method?.toUpperCase() ?? "POST";

  if (method === "GET") {
    return { status: 200, body: JSON.stringify({ ok: true, service: "admin", status: "ready" }) };
  }

  // ===== Authentication (token) =====
  const tokenDariHeader = request.headers?.authorization ?? request.headers?.["x-admin-secret-token"] ?? "";
  const tokenDariKode = Array.isArray(tokenDariHeader) ? tokenDariHeader[0] : tokenDariHeader;
  const expectedToken = process.env.ADMIN_SECRET_TOKEN ?? "";
  const keamananAdmin = validasiAdminToken(
    typeof tokenDariKode === "string" ? tokenDariKode.replace(/^Bearer\s+/i, "") : "",
    expectedToken,
  );
  if (!keamananAdmin.valid) {
    return { status: 401, body: JSON.stringify({ ok: false, error: keamananAdmin.alasan ?? "unauthorized: invalid admin token" }) };
  }

  // ===== Rate limit =====
  const limiter = new PenghitungBatasKejadian({
    maxPermintaan: Number(process.env.RATE_LIMIT_MAX_ACTIONS ?? "20"),
    jendelaMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60") * 1000,
  });
  const rateKey = request.headers?.["x-forwarded-for"] ?? request.headers?.["x-real-ip"] ?? "admin-global";
  const ipKey = Array.isArray(rateKey) ? rateKey[0] : String(rateKey);
  const hasilRate = limiter.periksa(ipKey || "admin-global");
  if (!hasilRate.diizinkan) {
    return { status: 429, body: JSON.stringify({ ok: false, error: "rate limited" }) };
  }

  // ===== Parse body =====
  let body: Record<string, unknown> = {};
  if (typeof request.body === "string") {
    try {
      body = JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      return { status: 400, body: JSON.stringify({ ok: false, error: "invalid json payload" }) };
    }
  } else if (request.body && typeof request.body === "object") {
    body = request.body as Record<string, unknown>;
  }

  const tokenDariBody =
    typeof body.auth === "object" && body.auth !== null
      ? String((body.auth as Record<string, unknown>).token ?? "")
      : typeof body.token === "string"
        ? body.token
        : "";
  const tokenFinal = tokenDariBody || String(tokenDariKode).replace(/^Bearer\s+/i, "");
  if (!expectedToken || tokenFinal !== expectedToken) {
    return { status: 401, body: JSON.stringify({ ok: false, error: "unauthorized: invalid admin token" }) };
  }

  const action = typeof body.action === "string" ? body.action : "healthDiagnostic";
  const adminId = typeof body.adminId === "string"
    ? body.adminId
    : typeof body.auth === "object" && body.auth !== null && typeof (body.auth as Record<string, unknown>).adminId === "string"
      ? String((body.auth as Record<string, unknown>).adminId)
      : "unknown";
  const payload = typeof body.payload === "object" && body.payload !== null ? (body.payload as Record<string, unknown>) : {};

  // Batasi ukuran payload operasional (BLOCKER 2 helper security).
  const validasiPayload = validasiInputTelegram(JSON.stringify(payload), 5000);
  if (!validasiPayload.valid) {
    return { status: 400, body: JSON.stringify({ ok: false, error: "admin payload terlalu besar" }) };
  }

  // ===== Resolve composition (production default; test dapat menyuntik) =====
  let komposisiTerpakai: KomposisiAplikasi;
  try {
    komposisiTerpakai = komposisi ?? dapatkanKomposisiAplikasi();
  } catch {
    catatAuditAdmin(adminId, action, "composition_unavailable", {});
    return { status: 500, body: JSON.stringify({ ok: false, error: "service_not_configured" }) };
  }

  const waktuSekarang = komposisiTerpakai.waktu.sekarangIso();

  // ===== Operations =====
  if (action === "healthDiagnostic") {
    const checks = { admin: true, firestore: true, telegram: false, ai: false };
    catatAuditAdmin(adminId, action, "ok", { checks });
    return { status: 200, body: JSON.stringify({ ok: true, action, checks, timestamp: new Date().toISOString() }) };
  }

  if (action === "publishCase") {
    const caseIdStr = typeof payload.caseId === "string" ? payload.caseId : "";
    const versionIdStr = typeof payload.versionId === "string" ? payload.versionId : "";
    if (!caseIdStr || !versionIdStr) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "publishCase membutuhkan payload.caseId dan payload.versionId" }) };
    }
    const versi = await komposisiTerpakai.repositoriVersiKasus.ambilVersiKasus(buatIdKasus(caseIdStr), buatIdVersiKasus(versionIdStr));
    if (!versi) {
      catatAuditAdmin(adminId, action, "not_found", { caseId: caseIdStr, versionId: versionIdStr });
      return { status: 404, body: JSON.stringify({ ok: false, error: "CaseVersion tidak ditemukan" }) };
    }
    if (versi.status === StatusVersiKasus.PUBLISHED) {
      catatAuditAdmin(adminId, action, "ok", { caseId: caseIdStr, versionId: versionIdStr, idempotent: true });
      return { status: 200, body: JSON.stringify({ ok: true, action, published: ringkasVersi(versi) }) };
    }
    if (versi.status === StatusVersiKasus.DISABLED) {
      catatAuditAdmin(adminId, action, "rejected", { caseId: caseIdStr, versionId: versionIdStr, status: "DISABLED" });
      return { status: 422, body: JSON.stringify({ ok: false, error: "CaseVersion dinonaktifkan — tidak dapat dipublish" }) };
    }
    // Part C — kandidat AI TIDAK boleh menjadi PUBLISHED bila mandatory image
    // assets durable belum ada. Kandidat ber-prefix "Generated case:" (hasil
    // layanan produksi) diwajibkan punya manifest aset non-kosong terlebih dulu.
    const kandidatAi = typeof versi.contentSummary === "string" && versi.contentSummary.startsWith("Generated case:");
    if (kandidatAi) {
      const manifest = await komposisiTerpakai.repositoriAsetVisual.ambilManifest(caseIdStr);
      if (!manifest || manifest.assets.length === 0) {
        catatAuditAdmin(adminId, action, "rejected", { caseId: caseIdStr, versionId: versionIdStr, reason: "incomplete_asset_manifest" });
        return { status: 422, body: JSON.stringify({ ok: false, error: "Case assets belum lengkap — generate image assets durable dahulu sebelum publish." }) };
      }
      // ASSET-STORAGE-DECISION: reference wajib ada & terverifikasi (bukan UNAVAILABLE/SUSPECT).
      const asetTakValid = manifest.assets.find(
        (aset) => (!aset.uri || aset.uri.trim() === "") || aset.status === "UNAVAILABLE" || !aset.verifiedAt,
      );
      if (asetTakValid) {
        catatAuditAdmin(adminId, action, "rejected", { caseId: caseIdStr, versionId: versionIdStr, reason: "invalid_or_unverified_asset_reference", assetId: asetTakValid.assetId });
        return { status: 422, body: JSON.stringify({ ok: false, error: "Terdapat asset tanpa reference valid / belum VERIFIED — tidak dapat dipublish (Human-in-the-Loop)." }) };
      }
    }
    try {
      const versiTerbit = publikasiVersiKasus(versi, waktuSekarang);
      await komposisiTerpakai.repositoriVersiKasus.simpanVersiKasus(versiTerbit);
      catatAuditAdmin(adminId, action, "ok", { caseId: caseIdStr, versionId: versionIdStr, publishedAt: waktuSekarang });
      return { status: 200, body: JSON.stringify({ ok: true, action, published: ringkasVersi(versiTerbit) }) };
    } catch (error) {
      return tanganiErorAdmin(adminId, action, error, { caseId: caseIdStr, versionId: versionIdStr });
    }
  }

  if (action === "inspectSession") {
    const sessionIdStr = typeof payload.sessionId === "string" ? payload.sessionId : "";
    if (!sessionIdStr) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "inspectSession membutuhkan payload.sessionId" }) };
    }
    const sesi = await komposisiTerpakai.repositoriSesiKasus.ambil(buatIdSesiKasus(sessionIdStr));
    if (!sesi) {
      catatAuditAdmin(adminId, action, "not_found", { sessionId: sessionIdStr });
      return { status: 404, body: JSON.stringify({ ok: false, error: "Session tidak ditemukan" }) };
    }
    catatAuditAdmin(adminId, action, "ok", { sessionId: sessionIdStr, status: sesi.status });
    return { status: 200, body: JSON.stringify({ ok: true, action, session: ringkasSesi(sesi) }) };
  }

  if (action === "forceArchive") {
    const sessionIdStr = typeof payload.sessionId === "string" ? payload.sessionId : "";
    if (!sessionIdStr) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "forceArchive membutuhkan payload.sessionId" }) };
    }
    const sesi = await komposisiTerpakai.repositoriSesiKasus.ambil(buatIdSesiKasus(sessionIdStr));
    if (!sesi) {
      catatAuditAdmin(adminId, action, "not_found", { sessionId: sessionIdStr });
      return { status: 404, body: JSON.stringify({ ok: false, error: "Session tidak ditemukan" }) };
    }
    if (sesi.status === StatusSesi.ARCHIVED) {
      catatAuditAdmin(adminId, action, "ok", { sessionId: sessionIdStr, idempotent: true });
      return { status: 200, body: JSON.stringify({ ok: true, action, archived: ringkasSesi(sesi) }) };
    }
    try {
      const sesiArsip = arsipkanSesi(sesi, waktuSekarang);
      await komposisiTerpakai.repositoriSesiKasus.simpan(sesiArsip);
      catatAuditAdmin(adminId, action, "ok", { sessionId: sessionIdStr, dari: sesi.status, ke: "ARCHIVED" });
      return { status: 200, body: JSON.stringify({ ok: true, action, archived: ringkasSesi(sesiArsip) }) };
    } catch (error) {
      return tanganiErorAdmin(adminId, action, error, { sessionId: sessionIdStr });
    }
  }

  if (action === "generateCase") {
    const seed = parseBenihKasus(payload);
    let hasil;
    try {
      const opsiGen = typeof payload.model === "string" ? { model: payload.model } : {};
      hasil = await komposisiTerpakai.layananProduksiKasus.generateCase(seed, opsiGen);
    } catch (error) {
      return tanganiErorProduksiAi(adminId, action, error, { seed: seed.genre });
    }
    catatAuditAdmin(adminId, action, "ok", { caseId: String(hasil.caseId), versionId: String(hasil.versionId) });
    return { status: 200, body: JSON.stringify({
      ok: true, action,
      candidate: { caseId: String(hasil.caseId), versionId: String(hasil.versionId), title: hasil.metadata?.title ?? "", caseBibleRef: hasil.caseBibleRef, assetManifestRef: hasil.assetManifestRef },
    }) };
  }

  if (action === "generateImages") {
    const caseIdStr = typeof payload.caseId === "string" ? payload.caseId : "";
    const plans = parseVisualPlans(payload.plans);
    if (!caseIdStr || plans.length === 0) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "generateImages membutuhkan payload.caseId dan payload.plans (VisualPlan[])." }) };
    }
    let manifest;
    try {
      manifest = await komposisiTerpakai.layananProduksiKasus.generateImages(caseIdStr, plans);
    } catch (error) {
      return tanganiErorProduksiAi(adminId, action, error, { caseId: caseIdStr });
    }
    catatAuditAdmin(adminId, action, "ok", { caseId: caseIdStr, assetCount: manifest.assets.length });
    return { status: 200, body: JSON.stringify({
      ok: true, action,
      manifest: { caseId: manifest.caseId, version: manifest.version, assetCount: manifest.assets.length,
        assets: manifest.assets.map((a) => ({ assetId: a.assetId, planId: a.planId, sceneId: a.sceneId, uri: a.uri, status: a.status })) },
    }) };
  }

  if (action === "verifyAssetTask") {
    const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
    if (!taskId) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "verifyAssetTask membutuhkan payload.taskId" }) };
    }
    let tugas;
    try {
      tugas = await komposisiTerpakai.layananTugasAset.verifikasiTugasAset(taskId);
    } catch (error) {
      catatAuditAdmin(adminId, action, "failed", { taskId, error: error instanceof Error ? error.name : "unknown" });
      return { status: 422, body: JSON.stringify({ ok: false, error: `verifikasi ditolak: ${error instanceof Error ? error.message : "unknown"}` }) };
    }
    catatAuditAdmin(adminId, action, "ok", { taskId, status: tugas.status });
    return { status: 200, body: JSON.stringify({ ok: true, action, task: { taskId: tugas.taskId, status: tugas.status, verifiedAt: tugas.verifiedAt ?? null } }) };
  }

  if (action === "rejectAssetTask") {
    const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
    const reason = typeof payload.reason === "string" ? payload.reason : "";
    if (!taskId) {
      return { status: 400, body: JSON.stringify({ ok: false, error: "rejectAssetTask membutuhkan payload.taskId" }) };
    }
    let tugas;
    try {
      tugas = await komposisiTerpakai.layananTugasAset.tolakTugasAset(taskId, reason);
    } catch (error) {
      catatAuditAdmin(adminId, action, "failed", { taskId, error: error instanceof Error ? error.name : "unknown" });
      return { status: 422, body: JSON.stringify({ ok: false, error: `penolakan ditolak: ${error instanceof Error ? error.message : "unknown"}` }) };
    }
    catatAuditAdmin(adminId, action, "ok", { taskId, status: tugas.status });
    return { status: 200, body: JSON.stringify({ ok: true, action, task: { taskId: tugas.taskId, status: tugas.status } }) };
  }

  if (action === "rejectCandidate") {
    catatAuditAdmin(adminId, action, "ok", {});
    return { status: 200, body: JSON.stringify({ ok: true, action, message: "Invalid candidates are never published." }) };
  }

  return { status: 400, body: JSON.stringify({ ok: false, error: "unsupported admin action" }) };
}

function parseBenihKasus(payload: Record<string, unknown>): BenihKasus {
  const seed = typeof payload.seed === "object" && payload.seed !== null ? (payload.seed as Record<string, unknown>) : {};
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    genre: typeof seed.genre === "string" ? seed.genre : "MYSTERY",
    setting: typeof seed.setting === "string" ? seed.setting : "generic",
    difficulty: typeof seed.difficulty === "string" ? seed.difficulty : "DETECTIVE",
    suspectCount: typeof seed.suspectCount === "number" ? seed.suspectCount : 3,
    sceneCount: typeof seed.sceneCount === "number" ? seed.sceneCount : 2,
    mustUseMechanics: strArr(seed.mustUseMechanics),
  };
}

function parseVisualPlans(value: unknown): VisualPlan[] {
  if (!Array.isArray(value)) return [];
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item): VisualPlan => {
      const p: VisualPlan = {
        planId: typeof item.planId === "string" ? item.planId : "",
        sceneId: typeof item.sceneId === "string" ? item.sceneId : "",
        purpose: (typeof item.purpose === "string" ? item.purpose : "CRIME_SCENE") as VisualPlan["purpose"],
        requiredClues: Array.isArray(item.requiredClues) ? (item.requiredClues as VisualPlan["requiredClues"]) : [],
        forbiddenClues: Array.isArray(item.forbiddenClues) ? (item.forbiddenClues as VisualPlan["forbiddenClues"]) : [],
        inspectableObjects: strArr(item.inspectableObjects),
      };
      if (Array.isArray(item.compositionNotes)) p.compositionNotes = strArr(item.compositionNotes);
      if (Array.isArray(item.styleConstraints)) p.styleConstraints = strArr(item.styleConstraints);
      if (Array.isArray(item.visualConstraints)) p.visualConstraints = strArr(item.visualConstraints);
      return p;
    })
    .filter((p) => p.planId !== "" && p.sceneId !== "");
}

function tanganiErorProduksiAi(
  adminId: string,
  action: string,
  error: unknown,
  refs: Record<string, unknown>,
): ResponHttpAdmin {
  catatAuditAdmin(adminId, action, "failed", { ...refs, error: error instanceof Error ? error.name : "unknown" });
  if (error instanceof KesalahanProviderAi) {
    const status =
      error.kategori === "AUTHENTICATION" || error.kategori === "PROVIDER_UNAVAILABLE" || error.kategori === "DISABLED" || error.kategori === "QUOTA_RATE_LIMIT"
        ? 503
        : 502;
    return {
      status,
      body: JSON.stringify({ ok: false, error: "provider_error", kategori: error.kategori, message: error.message }),
    };
  }
  return {
    status: 422,
    body: JSON.stringify({ ok: false, error: "generation_gagal", message: error instanceof Error ? error.message : "unknown" }),
  };
}

// ===== Helpers (respons ringkas - tanpa secret) =====

function ringkasVersi(versi: VersiKasus): Record<string, unknown> {
  return {
    caseId: String(versi.caseId),
    versionId: String(versi.versionId),
    status: versi.status,
    title: versi.metadata?.title ?? "",
    publishedAt: versi.publishedAt ?? null,
  };
}

function ringkasSesi(sesi: SesiKasus): Record<string, unknown> {
  return {
    sessionId: String(sesi.sessionId),
    groupId: String(sesi.groupId),
    caseId: String(sesi.caseId),
    caseVersionId: String(sesi.caseVersionId),
    status: sesi.status,
    outcome: sesi.outcome,
    score: sesi.score,
    playerCount: sesi.playerIds.length,
    playerIds: sesi.playerIds.map(String),
    startedAt: sesi.startedAt ?? null,
    updatedAt: sesi.updatedAt,
    solvedAt: sesi.solvedAt ?? null,
  };
}

type HasilAudit = "ok" | "failed" | "not_found" | "rejected" | "manual_operation" | "composition_unavailable";

/** Audit trail struktur (observability) - TIDAK pernah memuat token/secret. */
function catatAuditAdmin(
  adminId: string,
  action: string,
  result: HasilAudit,
  refs: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level: "info",
      event: "admin_operation",
      actor: adminId === "unknown" || adminId.length === 0 ? null : String(adminId).slice(0, 60),
      action,
      result,
      refs,
      timestamp: new Date().toISOString(),
    }),
  );
}

function tanganiErorAdmin(
  adminId: string,
  action: string,
  error: unknown,
  refs: Record<string, unknown>,
): ResponHttpAdmin {
  const refsAman = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, String(v).slice(0, 200)]));
  catatAuditAdmin(adminId, action, "failed", { ...refsAman, error: error instanceof Error ? error.name : "unknown" });
  return {
    status: 422,
    body: JSON.stringify({
      ok: false,
      error: `admin operation ditolak: ${error instanceof Error ? error.message : "unknown"}`,
    }),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const hasil = await handlerInternal({
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
  });

  res.status(hasil.status).send(hasil.body);
}

export { handlerInternal };
