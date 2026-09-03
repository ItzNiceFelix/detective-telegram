import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validasiAdminToken, validasiInputTelegram } from "../src/security/audit.js";
import { PenghitungBatasKejadian } from "../src/security/rate-limiter.js";
import { dapatkanKomposisiAplikasi, type KomposisiAplikasi } from "../src/komposisi/komposisi-aplikasi.js";
import { publikasiVersiKasus, StatusVersiKasus, type VersiKasus } from "../src/kasus/versi-kasus.js";
import { arsipkanSesi } from "../src/domain/services/transisi-sesi.js";
import type { SesiKasus } from "../src/domain/entities.js";
import { StatusSesi } from "../src/domain/enums.js";
import { buatIdKasus, buatIdSesiKasus, buatIdVersiKasus } from "../src/fondasi/primitif.js";

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
 * rejectCandidate/regenerateCase TIDAK diimplementasikan (pipeline AI real-time
 * bukan bagian beta) — didokumentasikan sebagai manual operation, bukan endpoint
 * boneka yang mengarang fakta.
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

  if (action === "rejectCandidate" || action === "regenerateCase") {
    catatAuditAdmin(adminId, action, "manual_operation", {});
    return {
      status: 501,
      body: JSON.stringify({
        ok: false,
        error: "manual_operation",
        message: `${action} tidak diimplementasikan untuk beta; lakukan sebagai manual operation (pipeline AI/real-time di luar scope beta).`,
      }),
    };
  }

  return { status: 400, body: JSON.stringify({ ok: false, error: "unsupported admin action" }) };
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
