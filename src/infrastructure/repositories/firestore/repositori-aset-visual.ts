import type { Firestore } from "firebase-admin/firestore";
import type {
  AsetVisual,
  ManifestAsetVisual,
  VisualPlan,
} from "../../../ai/visual-pipeline.js";
import type { KontrakRepositoriAsetVisual } from "../../../ai/visual-pipeline.js";

/**
 * Repositori aset visual DURABLE berbasis Firestore (pengganti RepositoriAsetVisualMemori).
 *
 * - ID dokumen asset = kunci STABIL `caseId:sceneId:planId` → reuse lintas replay.
 * - Menyimpan METADATA + referensi uri (BUKAN binary) — VISUAL_02/03.
 * - Manifest per case di koleksi terpisah.
 * Kolaksi: `visual_assets` dan `visual_asset_manifests`.
 */
export class RepositoriAsetVisualFirestore implements KontrakRepositoriAsetVisual {
  private readonly koleksiAset = "visual_assets";
  private readonly koleksiManifest = "visual_asset_manifests";

  constructor(private readonly firestore: Firestore) {}

  ambilKunci(plan: VisualPlan, caseId: string): string {
    // Identitas stabil — satu aset per plan/scene di-reuse (bukan regenerasi).
    return `${caseId}:${plan.sceneId}:${plan.planId}`;
  }

  async ambil(kunci: string): Promise<AsetVisual | null> {
    if (!kunci || !kunci.includes(":")) return null;
    const snap = await this.firestore.collection(this.koleksiAset).doc(kunci).get();
    if (!snap.exists) return null;
    return this.deserializeAset(snap.data() ?? {});
  }

  async simpan(aset: AsetVisual): Promise<AsetVisual> {
    const kunci = this.ambilKunci(
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
    await this.firestore.collection(this.koleksiAset).doc(kunci).set(this.serializeAset(aset));
    return aset;
  }

  async ambilManifest(caseId: string): Promise<ManifestAsetVisual | null> {
    if (!caseId) return null;
    const snap = await this.firestore.collection(this.koleksiManifest).doc(caseId).get();
    if (!snap.exists) return null;
    return this.deserializeManifest(snap.data() ?? {});
  }

  async simpanManifest(manifest: ManifestAsetVisual): Promise<ManifestAsetVisual> {
    await this.firestore.collection(this.koleksiManifest).doc(manifest.caseId).set(this.serializeManifest(manifest));
    return manifest;
  }

  // ===== serialize / deserialize =====
  private serializeAset(aset: AsetVisual): Record<string, unknown> {
    return {
      assetId: aset.assetId,
      planId: aset.planId,
      sceneId: aset.sceneId,
      caseId: aset.caseId,
      provider: aset.provider,
      uri: aset.uri,
      status: aset.status,
      format: aset.format,
      sizeBytes: aset.sizeBytes,
      requiredClues: aset.requiredClues,
      forbiddenClues: aset.forbiddenClues,
      verifyNotes: aset.verifyNotes ?? [],
      createdAt: aset.createdAt,
    };
  }

  private deserializeAset(d: Record<string, unknown>): AsetVisual {
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      assetId: str(d.assetId),
      planId: str(d.planId),
      sceneId: str(d.sceneId),
      caseId: str(d.caseId),
      provider: str(d.provider),
      uri: str(d.uri),
      status: d.status === "NEEDS_REVIEW" || d.status === "REJECTED" ? d.status : "READY",
      format: d.format === "image/jpeg" || d.format === "image/webp" ? d.format : "image/png",
      sizeBytes: typeof d.sizeBytes === "number" ? d.sizeBytes : 0,
      requiredClues: strArr(d.requiredClues),
      forbiddenClues: strArr(d.forbiddenClues),
      verifyNotes: strArr(d.verifyNotes),
      createdAt: str(d.createdAt),
    };
  }

  private serializeManifest(m: ManifestAsetVisual): Record<string, unknown> {
    return {
      manifestId: m.manifestId,
      caseId: m.caseId,
      assets: (m.assets ?? []).map((a) => this.serializeAset(a)),
      generatedAt: m.generatedAt,
      version: m.version,
    };
  }

  private deserializeManifest(d: Record<string, unknown>): ManifestAsetVisual {
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    return {
      manifestId: str(d.manifestId),
      caseId: str(d.caseId),
      assets: Array.isArray(d.assets) ? d.assets.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null).map((a) => this.deserializeAset(a)) : [],
      generatedAt: str(d.generatedAt),
      version: typeof d.version === "number" ? d.version : 1,
    };
  }
}