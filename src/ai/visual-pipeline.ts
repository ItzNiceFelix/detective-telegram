import { KesalahanValidasi } from "../fondasi/eror.js";
import type { PintuAi, PermintaanAi, ResponAi } from "./contracts.js";

export type TujuanVisual = "CRIME_SCENE" | "LOCATION" | "PORTRAIT" | "EVIDENCE_CLOSEUP" | "REVEAL";
export type StatusAsetVisual = "READY" | "NEEDS_REVIEW" | "REJECTED";
export type FormatAsetVisual = "image/png" | "image/jpeg" | "image/webp";

export interface KebutuhanVisual {
  id: string;
  label: string;
  entityId: string;
  kind: "scene" | "object" | "evidence" | "suspect" | "timeline";
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
  ambil(kunci: string): AsetVisual | null;
  simpan(aset: AsetVisual): AsetVisual;
  ambilManifest(caseId: string): ManifestAsetVisual | null;
  simpanManifest(manifest: ManifestAsetVisual): ManifestAsetVisual;
}

export class RepositoriAsetVisualMemori implements KontrakRepositoriAsetVisual {
  private readonly aset = new Map<string, AsetVisual>();
  private readonly manifest = new Map<string, ManifestAsetVisual>();

  ambilKunci(plan: VisualPlan, caseId: string): string {
    return `${caseId}:${plan.sceneId}:${plan.planId}:${plan.requiredClues.map((item) => item.id).join("|")}`;
  }

  ambil(kunci: string): AsetVisual | null {
    return this.aset.get(kunci) ?? null;
  }

  simpan(aset: AsetVisual): AsetVisual {
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

  ambilManifest(caseId: string): ManifestAsetVisual | null {
    return this.manifest.get(caseId) ?? null;
  }

  simpanManifest(manifest: ManifestAsetVisual): ManifestAsetVisual {
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
): Promise<AsetVisual> {
  const existingKey = repositori.ambilKunci(plan, caseId);
  const existing = repositori.ambil(existingKey);
  if (existing) {
    return existing;
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

  const asset: AsetVisual = {
    assetId: typeof parsed.assetId === "string" ? parsed.assetId : `ASSET-${plan.planId}`,
    planId: plan.planId,
    sceneId: plan.sceneId,
    caseId,
    provider: providerName,
    uri: typeof parsed.uri === "string" ? parsed.uri : `https://example.test/${plan.planId}.png`,
    status: (typeof parsed.status === "string" && parsed.status === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : "READY",
    format: (typeof parsed.format === "string" ? parsed.format : "image/png") as FormatAsetVisual,
    sizeBytes: typeof parsed.sizeBytes === "number" ? parsed.sizeBytes : 150000,
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

  const keyKanonik = repositori.ambilKunci(plan, caseId);
  if (repositori instanceof RepositoriAsetVisualMemori) {
    (repositori as RepositoriAsetVisualMemori & { aset: Map<string, AsetVisual> })["aset"].set(keyKanonik, asset);
  } else {
    repositori.simpan(asset);
  }

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

export function simpanReferensiAset(
  repositori: KontrakRepositoriAsetVisual,
  caseId: string,
  aset: AsetVisual,
): ManifestAsetVisual {
  repositori.simpan(aset);
  const manifestLama = repositori.ambilManifest(caseId) ?? {
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
