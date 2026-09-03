import { KesalahanValidasi } from "../fondasi/eror.js";

/**
 * AssetTask domain — Human-in-the-Loop (Beta).
 * docs/AI-IMAGE-HUMAN-IN-LOOP-DECISION.md, docs/ASSET-TASK-RUNBOOK.md
 *
 * Murni domain: TIDAK mengenal Telegram API, Firestore, atau provider apa pun.
 * Tanggung jawab: state machine AssetTask + validasi transisi legal.
 *
 * Status: DRAFT | WAITING_FOR_ADMIN | SUBMITTED | VERIFYING | VERIFIED | REJECTED | EXPIRED
 */

export type StatusTugasAset =
  | "DRAFT"
  | "WAITING_FOR_ADMIN"
  | "SUBMITTED"
  | "VERIFYING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export type TipeAsetVisual = "CRIME_SCENE" | "LOCATION" | "PORTRAIT" | "EVIDENCE_CLOSEUP" | "REVEAL";

export interface TugasAset {
  taskId: string;
  caseId: string;
  caseVersionId: string;
  sceneId: string;
  planId: string;
  assetType: TipeAsetVisual;
  prompt: string;
  requiredClues: string[];
  status: StatusTugasAset;
  /** message_id task message di vault (milik bot). */
  telegramMessageId?: string;
  /** `file_id` foto submission admin (provider-specific, BEST_EFFORT). */
  telegramFileId?: string;
  submittedBy?: string;
  submittedAt?: string;
  verifiedAt?: string;
  /** Metadata dimensi submission (opsional; dipakai membangun AsetVisual). */
  width?: number;
  height?: number;
  sizeBytes?: number;
  /** Alasan penolakan (bounded, non-secret). */
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Status yang menerima submission gambar baru (kandidat boleh diganti sebelum
 * VERIFIED). VERIFIED immutable; DRAFT/VERIFYING tidak menerima direct submit.
 */
export const STATUS_TERIMA_KIRIMAN: ReadonlyArray<StatusTugasAset> = [
  "WAITING_FOR_ADMIN",
  "SUBMITTED",
  "REJECTED",
];

/** Identitas dedup canonical (sama dengan identitas aset visual). */
export function identitasTugasAset(caseId: string, sceneId: string, planId: string): string {
  return `${caseId}:${sceneId}:${planId}`;
}

export function dapatTerimaKiriman(status: StatusTugasAset): boolean {
  return STATUS_TERIMA_KIRIMAN.includes(status);
}

/* Transisi transisi legal per status. */
const TRANSISI: Record<StatusTugasAset, ReadonlyArray<StatusTugasAset>> = {
  DRAFT: ["WAITING_FOR_ADMIN", "EXPIRED"],
  WAITING_FOR_ADMIN: ["SUBMITTED", "REJECTED", "EXPIRED"],
  SUBMITTED: ["SUBMITTED", "VERIFYING", "VERIFIED", "REJECTED"],
  VERIFYING: ["VERIFIED", "REJECTED"],
  VERIFIED: [],
  REJECTED: ["WAITING_FOR_ADMIN", "EXPIRED"],
  EXPIRED: [],
};

/** Validasi transisi; melempar KesalahanValidasi bila illegal. */
export function transisiTugasAset(
  tugas: TugasAset,
  tujuan: StatusTugasAset,
): TugasAset {
  if (tugas.status === tujuan && tujuan !== "SUBMITTED") {
    throw new KesalahanValidasi(`Transisi AssetTask ke status yang sama ($s) tidak diizinkan.`.replace("$s", tujuan));
  }
  const diizinkan = TRANSISI[tugas.status] ?? [];
  if (!diizinkan.includes(tujuan)) {
    throw new KesalahanValidasi(
      `Transisi AssetTask tidak legal: ${tugas.status} → ${tujuan}.`,
    );
  }
  return { ...tugas, status: tujuan, updatedAt: tanggal() };
}

const tanggal = (): string => new Date().toISOString();

export interface SeedTugasAset {
  taskId: string;
  caseId: string;
  caseVersionId: string;
  sceneId: string;
  planId: string;
  assetType: TipeAsetVisual;
  prompt: string;
  requiredClues: string[];
  status?: StatusTugasAset;
  createdAt?: string;
  updatedAt?: string;
}

/** Buat AssetTask baru berstatus DRAFT. */
export function buatTugasAset(seed: SeedTugasAset): TugasAset {
  if (!seed.taskId || !seed.caseId || !seed.caseVersionId || !seed.sceneId || !seed.planId) {
    throw new KesalahanValidasi("AssetTask wajib memiliki taskId, caseId, caseVersionId, sceneId, planId.");
  }
  if (!seed.prompt || seed.prompt.trim().length === 0) {
    throw new KesalahanValidasi("AssetTask wajib memiliki prompt (kanonik dari VisualPlan).");
  }
  if (seed.requiredClues.length === 0) {
    throw new KesalahanValidasi("AssetTask wajib memiliki setidaknya satu required clue.");
  }
  const waktu = seed.createdAt ?? tanggal();
  return {
    taskId: seed.taskId,
    caseId: seed.caseId,
    caseVersionId: seed.caseVersionId,
    sceneId: seed.sceneId,
    planId: seed.planId,
    assetType: seed.assetType,
    prompt: seed.prompt,
    requiredClues: [...seed.requiredClues],
    status: seed.status ?? "DRAFT",
    createdAt: waktu,
    updatedAt: seed.updatedAt ?? waktu,
  };
}

/** Update field non-status dengan timestamp baru (hasil mutasi). */
export function beriWaktu(tugas: TugasAset, waktu: string): TugasAset {
  return { ...tugas, updatedAt: waktu };
}

export interface KontrakRepositoriTugasAset {
  simpan(tugas: TugasAset): Promise<TugasAset>;
  ambil(taskId: string): Promise<TugasAset | null>;
  /** Lookup task via `telegramMessageId` (dipakai untuk memetakan reply). */
  ambilBerdasarkanMessage(messageId: string): Promise<TugasAset | null>;
  /** Dedup lookup: task untuk identity `caseId:sceneId:planId`. */
  ambilBerdasarkanIdentitas(caseId: string, sceneId: string, planId: string): Promise<TugasAset | null>;
  ambilSemuaUntukCase(caseId: string): Promise<TugasAset[]>;
}