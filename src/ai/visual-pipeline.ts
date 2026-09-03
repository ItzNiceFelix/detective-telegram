import { KesalahanValidasi } from "../fondasi/eror.js";
import { KesalahanProviderAi } from "./errors.js";
import type { PintuAi, PermintaanAi, ResponAi } from "./contracts.js";

export type TujuanVisual = "CRIME_SCENE" | "LOCATION" | "PORTRAIT" | "EVIDENCE_CLOSEUP" | "REVEAL";
export type StatusAsetVisual = "READY" | "NEEDS_REVIEW" | "REJECTED";
export type FormatAsetVisual = "image/png" | "image/jpeg" | "image/webp";

export interface KebutuhanVisual {
  id: string;
  label: string;
  entityId: string;
  kind: "scene" | "object" | "evidence" | "suspect" | "timeline" | string;
}

export interface VisualPlan {
  planId: string;
  sceneId: string;
  purpose: TujuanVisual;
  requiredClues: KebutuhanVisual[];
  forbiddenClues: KebutuhanVisual[];
  inspectableObjects: string[];
  compositionNotes?: string[];
  styleConstraints?: string[];
  visualConstraints?: string[];
}

export interface AsetVisual {
  assetId: string;
  planId: string;
  sceneId: string;
  caseId: string;
  provider: string;
  uri: string;
  status: StatusAsetVisual;
  format: FormatAsetVisual;
  sizeBytes: number;
  requiredClues: string[];
  forbiddenClues: string[];
  verifyNotes?: string[];
  createdAt: string;
}

export interface ManifestAsetVisual {
  manifestId: string;
  caseId: string;
  assets: AsetVisual[];
  generatedAt: string;
  version: number;
}

export interface KontrakPenyediaGambar {
  generateImage(request: PermintaanAi): Promise<ResponAi>;
}

export interface KontrakRepositoriAsetVisual {
  ambilKunci(plan: VisualPlan, caseId: string): string;
  ambil(kunci: string): Promise<AsetVisual | null>;
  simpan(aset: AsetVisual): Promise<AsetVisual>;
  ambilManifest(caseId: string): Promise<ManifestAsetVisual | null>;
  simpanManifest(manifest: ManifestAsetVisual): Promise<ManifestAsetVisual>;
}

// ===== Object storage durable untuk binary image (diisolasi di balik kontrak).
// SDK storage TIDAK boleh berada di domain; implementasi rill (Firebase Storage)
// hidup di src/infrastructure. Durable URI yang disimpan stabil & BUKAN signed-url
// (bukan secret). Binary TIDAK pernah masuk Firestore (VISUAL_02/03).
export const FORMAT_GAMBAR_DIDUKUNG: ReadonlyArray<FormatAsetVisual> = ["image/png", "image/jpeg", "image/webp"];
export const UKURAN_MAKS_GAMBAR_BYTES = 20_000_000; // sejalan ValidasiAsetVisual

export interface ObyekGambarTersimpan {
  bytes: Uint8Array;
  contentType: string;
}

/** Kontrak object storage image binary (durabel lintas cold-start Vercel). */
export interface KontrakPenyimpananGambar {
  /** Simpan binary → return URI object durable & stabil (bukan signed URL rahasia). */
  simpan(kunci: string, obyek: ObyekGambarTersimpan): Promise<string>;
  /** Deteksi object hilang/dangling (uri dari simpan). */
  ada(uri: string): Promise<boolean>;
}

/** Deteksi URI durable (gs:// Firebase Storage, atau scheme fake test). */
export function isUriDurable(uri: string): boolean {
  return uri.startsWith("gs://") || uri.startsWith("asset://memori/");
}

/** Validasi content-type + ukuran binary image sebelum persist durable. */
export function validasiKontenGambar(bytes: Uint8Array, contentType: string): void {
  if (!FORMAT_GAMBAR_DIDUKUNG.includes(contentType as FormatAsetVisual)) {
    throw new KesalahanValidasi(`Content type gambar tidak didukung: ${contentType}`);
  }
  if (bytes.byteLength <= 0 || bytes.byteLength > UKURAN_MAKS_GAMBAR_BYTES) {
    throw new KesalahanValidasi(`Ukuran gambar di luar batas operasional (${bytes.byteLength} bytes).`);
  }
}

/** Implementasi penyimpanan gambar MEMORI (fake/test; tidak durable lintas proses). */
export class PenyimpananGambarMemori implements KontrakPenyimpananGambar {
  private readonly gudang = new Map<string, Uint8Array>();
  /** Simulasi kegagalan upload untuk kunci tertentu (uji "upload failure"). */
  gagalSimpanPadaKunci?: (kunci: string) => boolean;

  async simpan(kunci: string, obyek: ObyekGambarTersimpan): Promise<string> {
    if (this.gagalSimpanPadaKunci?.(kunci)) {
      throw new KesalahanValidasi("Simulasi kegagalan upload object storage.");
    }
    this.gudang.set(kunci, obyek.bytes);
    return `asset://memori/${kunci}`;
  }

  async ada(uri: string): Promise<boolean> {
    const kunci = uri.startsWith("asset://memori/") ? uri.slice("asset://memori/".length) : null;
    return kunci === null ? false : this.gudang.has(kunci);
  }

  /** Helper test: hapus object untuk mensimulasikan object hilang (dangling ref). */
  hapus(kunci: string): void {
    this.gudang.delete(kunci);
  }
}

export class RepositoriAsetVisualMemori implements KontrakRepositoriAsetVisual {
  private readonly aset = new Map<string, AsetVisual>();
  private readonly manifest = new Map<string, ManifestAsetVisual>();

  ambilKunci(plan: VisualPlan, caseId: string): string {
    // Kunci dedup berbasis identitas stabil (case + scene + plan), BUKAN daftar
    // clue hasil parsing. Menyimpan pada caseId:sceneId:planId menjamin satu
    // aset per plan/scene di-reuse.
    return `${caseId}:${plan.sceneId}:${plan.planId}`;
  }

  async ambil(kunci: string): Promise<AsetVisual | null> {
    return this.aset.get(kunci) ?? null;
  }

  async simpan(aset: AsetVisual): Promise<AsetVisual> {
    const key = this.ambilKunci(
      {
        planId: aset.planId,
        sceneId: aset.sceneId,
        purpose: "CRIME_SCENE",
        requiredClues: aset.requiredClues.map((id) => ({ id, label: id, entityId: id, kind: "object" })),
        forbiddenClues: aset.forbiddenClues.map((id) => ({ id, label: id, entityId: id, kind: "object" })),
        inspectableObjects: [],
      },
      aset.caseId,
    );
    this.aset.set(key, aset);
    return aset;
  }

  async ambilManifest(caseId: string): Promise<ManifestAsetVisual | null> {
    return this.manifest.get(caseId) ?? null;
  }

  async simpanManifest(manifest: ManifestAsetVisual): Promise<ManifestAsetVisual> {
    this.manifest.set(manifest.caseId, manifest);
    return manifest;
  }
}

export function bersihkanInputAi(value: string): string {
  const data = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/(ignore|override|system prompt|developer prompt|you are|act as)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return data.slice(0, 400);
}

export class PembuatPromptVisual {
  bangunPromptVisual(plan: VisualPlan, konteks: Record<string, unknown> = {}): string {
    const scene = bersihkanInputAi(String(konteks.scene ?? plan.sceneId));
    const required = plan.requiredClues.map((item) => `${item.kind}:${item.entityId}:${bersihkanInputAi(item.label)}`).join(", ");
    const forbidden = plan.forbiddenClues.map((item) => `${item.kind}:${item.entityId}:${bersihkanInputAi(item.label)}`).join(", ");
    const style = plan.styleConstraints?.map((item) => bersihkanInputAi(item)).join("; ") ?? "cinematic noir mystery";
    const constraints = plan.visualConstraints?.map((item) => bersihkanInputAi(item)).join("; ") ?? "No text overlays, no new suspect, no new weapon, no canonical fact changes.";

    return `
      Generate a single mystery scene illustration for case scene ${scene}. 
      Purpose: ${plan.purpose}. 
      Required clues: ${required || "none"}. 
      Forbidden clues: ${forbidden || "none"}. 
      Inspectable objects: ${plan.inspectableObjects.map((item) => bersihkanInputAi(item)).join(", ") || "none"}. 
      Style: ${style}. 
      Constraints: ${constraints}. 
      Keep canonical facts unchanged: only render approved scene details. 
      Return only JSON with assetId, uri, status, format, sizeBytes, requiredClues, forbiddenClues, verifyNotes.
    `;
  }
}

export class ValidasiAsetVisual {
  validasiAset(aset: AsetVisual): void {
    if (!aset.uri || aset.uri.trim() === "") {
      throw new KesalahanValidasi("Aset visual tidak memiliki URI.");
    }

    if (!aset.requiredClues || aset.requiredClues.length === 0) {
      throw new KesalahanValidasi("Aset visual harus memiliki metadata clue yang dibutuhkan.");
    }

    if (aset.sizeBytes <= 0 || aset.sizeBytes > 20_000_000) {
      throw new KesalahanValidasi("Ukuran aset visual di luar batas operasional.");
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(aset.format)) {
      throw new KesalahanValidasi("Format aset visual tidak didukung.");
    }

    if (aset.status === "REJECTED") {
      throw new KesalahanValidasi("Aset visual ditolak.");
    }
  }

  validasiManifest(manifest: ManifestAsetVisual): void {
    if (!manifest.caseId || !manifest.assets || manifest.assets.length === 0) {
      throw new KesalahanValidasi("Manifest aset visual wajib memiliki setidaknya satu aset valid.");
    }

    for (const aset of manifest.assets) {
      this.validasiAset(aset);
    }
  }
}

export class PenyediaGambarPalsu implements KontrakPenyediaGambar {
  public calls: PermintaanAi[] = [];
  public responses: Array<string | ResponAi> = [];

  constructor(responses: Array<string | ResponAi> = []) {
    this.responses = [...responses];
  }

  async generateImage(request: PermintaanAi): Promise<ResponAi> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (!next) {
      throw new KesalahanValidasi("PenyediaGambarPalsu tidak memiliki response tersisa.");
    }

    return typeof next === "string" ? { output: next, warnings: [] } : next;
  }
}

export function buatAsetVisualDummy(plan: VisualPlan, caseId: string, providerName = "fake"): AsetVisual {
  return {
    assetId: `ASSET-${plan.planId}`,
    planId: plan.planId,
    sceneId: plan.sceneId,
    caseId,
    provider: providerName,
    uri: `https://example.test/${plan.planId}.png`,
    status: "READY",
    format: "image/png",
    sizeBytes: 150000,
    requiredClues: plan.requiredClues.map((item) => item.id),
    forbiddenClues: plan.forbiddenClues.map((item) => item.id),
    verifyNotes: ["Metadata clue present; no automated vision validation available."],
    createdAt: new Date().toISOString(),
  };
}

export async function hasilkanAsetGambar(
  caseId: string,
  plan: VisualPlan,
  penyedia: KontrakPenyediaGambar,
  repositori: KontrakRepositoriAsetVisual,
  providerName = "provider-default",
  penyimpanan?: KontrakPenyimpananGambar,
): Promise<AsetVisual> {
  const existingKey = repositori.ambilKunci(plan, caseId);
  const existing = await repositori.ambil(existingKey);
  if (existing) {
    // Aset durable: verifikasi object masih ada (deteksi dangling / object hilang).
    if (penyimpanan && isUriDurable(existing.uri)) {
      const ada = await penyimpanan.ada(existing.uri);
      if (ada) {
        return existing;
      }
      // Object hilang → lanjut generate ulang (cache hit palsu).
    } else {
      return existing;
    }
  }

  const promptBuilder = new PembuatPromptVisual();
  const prompt = promptBuilder.bangunPromptVisual(plan, { scene: plan.sceneId, caseId });
  const request: PermintaanAi = {
    promptType: "visual_prompt",
    context: {
      caseId,
      sceneId: plan.sceneId,
      plan,
      prompt,
    },
  };

  const response = await penyedia.generateImage(request);
  const dirty = response.output.toLowerCase();
  if (/(secret|token|private data|password|system prompt|developer prompt)/i.test(dirty)) {
    throw new KesalahanValidasi("Konten visual melanggar moderasi: output menampilkan data sensitif.");
  }

  const parsed = JSON.parse(response.output) as Record<string, unknown>;

  const assetId = typeof parsed.assetId === "string" ? parsed.assetId : `ASSET-${plan.planId}`;
  const format = (typeof parsed.format === "string" ? parsed.format : "image/png") as FormatAsetVisual;
  let sizeBytes = typeof parsed.sizeBytes === "number" ? parsed.sizeBytes : 150000;

  let uri: string;
  const bytesBase64 = typeof parsed.bytesBase64 === "string" && parsed.bytesBase64.length > 0 ? parsed.bytesBase64 : null;
  if (bytesBase64) {
    // Jalur DURABLE: binary harus di-persist ke object storage; gagal = aset TIDAK dipublish.
    if (!penyimpanan) {
      throw new KesalahanProviderAi(
        "Penyimpanan object storage tidak tersedia; binary image tidak dapat di-persist durable.",
        "PROVIDER_UNAVAILABLE",
      );
    }
    const bytes = new Uint8Array(Buffer.from(bytesBase64, "base64"));
    const contentType = typeof parsed.contentType === "string" && parsed.contentType.length > 0 ? parsed.contentType : format;
    validasiKontenGambar(bytes, contentType);
    sizeBytes = bytes.byteLength;
    uri = await penyimpanan.simpan(existingKey, { bytes, contentType });
  } else {
    // Jalur metadata-only (provider non-durable/fake): pakai uri dari output.
    uri = typeof parsed.uri === "string" && parsed.uri.length > 0 ? parsed.uri : `https://example.test/${plan.planId}.png`;
    if (isUriDurable(uri)) {
      throw new KesalahanValidasi("uri output tampak durable padahal tidak menyertakan binary image.");
    }
  }

  const asset: AsetVisual = {
    assetId,
    planId: plan.planId,
    sceneId: plan.sceneId,
    caseId,
    provider: providerName,
    uri,
    status: (typeof parsed.status === "string" && parsed.status === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : "READY",
    format,
    sizeBytes,
    requiredClues: Array.isArray(parsed.requiredClues) ? parsed.requiredClues.filter((item): item is string => typeof item === "string") : plan.requiredClues.map((item) => item.id),
    forbiddenClues: Array.isArray(parsed.forbiddenClues) ? parsed.forbiddenClues.filter((item): item is string => typeof item === "string") : plan.forbiddenClues.map((item) => item.id),
    verifyNotes: Array.isArray(parsed.verifyNotes) ? parsed.verifyNotes.filter((item): item is string => typeof item === "string") : ["Metadata clue present; no automated vision validation available."],
    createdAt: new Date().toISOString(),
  };

  const validator = new ValidasiAsetVisual();
  if (asset.requiredClues.length === 0) {
    asset.status = "NEEDS_REVIEW";
    asset.verifyNotes = ["No automated clue verification available; pending human review."];
  }

  validator.validasiAset(asset);
  await repositori.simpan(asset);

  return asset;
}

export function buatManifestAsetVisual(caseId: string, aset: AsetVisual[]): ManifestAsetVisual {
  return {
    manifestId: `manifest-${caseId}`,
    caseId,
    assets: aset,
    generatedAt: new Date().toISOString(),
    version: 1,
  };
}

export async function simpanReferensiAset(
  repositori: KontrakRepositoriAsetVisual,
  caseId: string,
  aset: AsetVisual,
): Promise<ManifestAsetVisual> {
  await repositori.simpan(aset);
  const manifestLama = (await repositori.ambilManifest(caseId)) ?? {
    manifestId: `manifest-${caseId}`,
    caseId,
    assets: [],
    generatedAt: new Date().toISOString(),
    version: 1,
  };

  const manifest = {
    ...manifestLama,
    assets: [...manifestLama.assets.filter((item) => item.planId !== aset.planId), aset],
    generatedAt: new Date().toISOString(),
    version: manifestLama.version + 1,
  };

  return repositori.simpanManifest(manifest);
}

export const VISUAL_GENERATION_INVARIANTS = [
  "VISUAL_01 — image generation is offline/admin only",
  "VISUAL_02 — no binary image in Firestore",
  "VISUAL_03 — only validated asset references are persistent",
  "VISUAL_04 — asset verification is explicit, not assumed",
] as const;

export const FakeImageProvider = PenyediaGambarPalsu;
