import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validasiAdminToken } from "../src/security/audit.js";
import { PenghitungBatasKejadian } from "../src/security/rate-limiter.js";

interface PermintaanHttpAdmin {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Record<string, unknown> | null;
}

async function handlerInternal(request: PermintaanHttpAdmin = {}): Promise<{ status: number; body: string }> {
  const method = request.method?.toUpperCase() ?? "POST";

  if (method === "GET") {
    return {
      status: 200,
      body: JSON.stringify({ ok: true, service: "admin", status: "ready" }),
    };
  }

  const tokenDariHeader = request.headers?.authorization ?? request.headers?.["x-admin-secret-token"] ?? "";
  const tokenDariKode = Array.isArray(tokenDariHeader) ? tokenDariHeader[0] : tokenDariHeader;

  const expectedToken = process.env.ADMIN_SECRET_TOKEN ?? "";
  const keamananAdmin = validasiAdminToken(
    typeof tokenDariKode === "string" ? tokenDariKode.replace(/^Bearer\s+/i, "") : "",
    expectedToken,
  );

  if (!keamananAdmin.valid) {
    return {
      status: 401,
      body: JSON.stringify({ ok: false, error: keamananAdmin.alasan ?? "unauthorized: invalid admin token" }),
    };
  }

  const limiter = new PenghitungBatasKejadian({
    maxPermintaan: Number(process.env.RATE_LIMIT_MAX_ACTIONS ?? "20"),
    jendelaMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60") * 1000,
  });
  const rateKey = request.headers?.["x-forwarded-for"] ?? request.headers?.["x-real-ip"] ?? "admin-global";
  const ipKey = Array.isArray(rateKey) ? rateKey[0] : String(rateKey);
  const hasilRate = limiter.periksa(ipKey || "admin-global");
  if (!hasilRate.diizinkan) {
    return {
      status: 429,
      body: JSON.stringify({ ok: false, error: "rate limited" }),
    };
  }

  let body: Record<string, unknown> = {};

  if (typeof request.body === "string") {
    try {
      body = JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      return {
        status: 400,
        body: JSON.stringify({ ok: false, error: "invalid json payload" }),
      };
    }
  } else if (request.body && typeof request.body === "object") {
    body = request.body as Record<string, unknown>;
  }

  const tokenDariBody = typeof body.auth === "object" && body.auth !== null
    ? String((body.auth as Record<string, unknown>).token ?? "")
    : typeof body.token === "string"
      ? body.token
      : "";

  const tokenFinal = tokenDariBody || String(tokenDariKode).replace(/^Bearer\s+/i, "");

  if (!expectedToken || tokenFinal !== expectedToken) {
    return {
      status: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized: invalid admin token" }),
    };
  }

  const action = typeof body.action === "string" ? body.action : "healthDiagnostic";

  const hasil = {
    ok: true,
    action,
    message: "Admin operation received and authorized. Backend mutation logic is pending implementation.",
    timestamp: new Date().toISOString(),
  };

  if (action === "healthDiagnostic") {
    return { status: 200, body: JSON.stringify({ ...hasil, checks: { telegram: true, firestore: false, ai: false } }) };
  }

  if (["publishCase", "rejectCandidate", "inspectSession", "forceArchive", "regenerateCase"].includes(action)) {
    return { status: 202, body: JSON.stringify(hasil) };
  }

  return {
    status: 400,
    body: JSON.stringify({ ok: false, error: "unsupported admin action" }),
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
