import type { Firestore } from "firebase-admin/firestore";
import { identitasTugasAset, type KontrakRepositoriTugasAset, type StatusTugasAset, type TugasAset } from "../../../kasus/tugas-aset.js";

/**
 * Repositori AssetTask berbasis Firestore (metadata/ref, TANPA binary).
 * Collection: `asset_tasks`, doc id = taskId. Menyimpan field `identity`
 * (caseId:sceneId:planId) untuk dedup lookup via query tunggal.
 */
export class RepositoriTugasAsetFirestore implements KontrakRepositoriTugasAset {
  private readonly koleksi = "asset_tasks";

  constructor(private readonly firestore: Firestore) {}

  async simpan(tugas: TugasAset): Promise<TugasAset> {
    await this.firestore.collection(this.koleksi).doc(tugas.taskId).set(this.serialize(tugas));
    return tugas;
  }

  async ambil(taskId: string): Promise<TugasAset | null> {
    if (!taskId) return null;
    const snap = await this.firestore.collection(this.koleksi).doc(taskId).get();
    if (!snap.exists) return null;
    return this.deserialize(snap.data() ?? {});
  }

  async ambilBerdasarkanMessage(messageId: string): Promise<TugasAset | null> {
    if (!messageId) return null;
    const snap = await this.firestore.collection(this.koleksi).where("telegramMessageId", "==", messageId).get();
    const dok = snap.docs[0];
    if (!dok) return null;
    return this.deserialize(dok.data() ?? {});
  }

  async ambilBerdasarkanIdentitas(caseId: string, sceneId: string, planId: string): Promise<TugasAset | null> {
    const ident = identitasTugasAset(caseId, sceneId, planId);
    const snap = await this.firestore.collection(this.koleksi).where("identity", "==", ident).get();
    const dok = snap.docs[0];
    if (!dok) return null;
    return this.deserialize(dok.data() ?? {});
  }

  async ambilSemuaUntukCase(caseId: string): Promise<TugasAset[]> {
    if (!caseId) return [];
    const snap = await this.firestore.collection(this.koleksi).where("caseId", "==", caseId).get();
    return snap.docs.map((d) => this.deserialize(d.data() ?? {}));
  }

  // ===== serialize / deserialize =====
  private serialize(tugas: TugasAset): Record<string, unknown> {
    const d: Record<string, unknown> = {
      taskId: tugas.taskId,
      caseId: tugas.caseId,
      caseVersionId: tugas.caseVersionId,
      sceneId: tugas.sceneId,
      planId: tugas.planId,
      assetType: tugas.assetType,
      prompt: tugas.prompt,
      requiredClues: tugas.requiredClues,
      status: tugas.status,
      identity: identitasTugasAset(tugas.caseId, tugas.sceneId, tugas.planId),
      createdAt: tugas.createdAt,
      updatedAt: tugas.updatedAt,
    };
    if (tugas.telegramMessageId !== undefined) d.telegramMessageId = tugas.telegramMessageId;
    if (tugas.telegramFileId !== undefined) d.telegramFileId = tugas.telegramFileId;
    if (tugas.submittedBy !== undefined) d.submittedBy = tugas.submittedBy;
    if (tugas.submittedAt !== undefined) d.submittedAt = tugas.submittedAt;
    if (tugas.verifiedAt !== undefined) d.verifiedAt = tugas.verifiedAt;
    if (tugas.width !== undefined) d.width = tugas.width;
    if (tugas.height !== undefined) d.height = tugas.height;
    if (tugas.sizeBytes !== undefined) d.sizeBytes = tugas.sizeBytes;
    if (tugas.rejectionReason !== undefined) d.rejectionReason = tugas.rejectionReason;
    return d;
  }

  private deserialize(d: Record<string, unknown>): TugasAset {
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const optStr = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
    const statusRaw = str(d.status);
    const status: StatusTugasAset =
      statusRaw === "DRAFT" || statusRaw === "WAITING_FOR_ADMIN" || statusRaw === "SUBMITTED" ||
      statusRaw === "VERIFYING" || statusRaw === "VERIFIED" || statusRaw === "REJECTED" || statusRaw === "EXPIRED"
        ? statusRaw
        : "DRAFT";
    const hasil: TugasAset = {
      taskId: str(d.taskId),
      caseId: str(d.caseId),
      caseVersionId: str(d.caseVersionId),
      sceneId: str(d.sceneId),
      planId: str(d.planId),
      assetType: str(d.assetType) as TugasAset["assetType"],
      prompt: str(d.prompt),
      requiredClues: strArr(d.requiredClues),
      status,
      createdAt: str(d.createdAt),
      updatedAt: str(d.updatedAt),
    };
    const msg = optStr(d.telegramMessageId);
    const fid = optStr(d.telegramFileId);
    const subBy = optStr(d.submittedBy);
    const subAt = optStr(d.submittedAt);
    const vAt = optStr(d.verifiedAt);
    const rej = optStr(d.rejectionReason);
    if (msg) hasil.telegramMessageId = msg;
    if (fid) hasil.telegramFileId = fid;
    if (subBy) hasil.submittedBy = subBy;
    if (subAt) hasil.submittedAt = subAt;
    if (vAt) hasil.verifiedAt = vAt;
    if (rej) hasil.rejectionReason = rej;
    if (typeof d.width === "number" && Number.isFinite(d.width)) hasil.width = d.width;
    if (typeof d.height === "number" && Number.isFinite(d.height)) hasil.height = d.height;
    if (typeof d.sizeBytes === "number" && Number.isFinite(d.sizeBytes)) hasil.sizeBytes = d.sizeBytes;
    return hasil;
  }
}