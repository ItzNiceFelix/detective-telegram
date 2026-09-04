import type { PenyediaWaktu } from "../../fondasi/waktu.js";
import { KesalahanKonfigurasi, KesalahanValidasi } from "../../fondasi/eror.js";
import {
  buatTugasAset,
  dapatTerimaKiriman,
  identitasTugasAset,
  transisiTugasAset,
  type KontrakRepositoriTugasAset,
  type TipeAsetVisual,
  type TugasAset,
} from "../../kasus/tugas-aset.js";
import {
  PembuatPromptVisual,
  simpanReferensiAset,
  UKURAN_MAKS_GAMBAR_BYTES,
  type AsetVisual,
  type FormatAsetVisual,
  type KontrakRepositoriAsetVisual,
  type VisualPlan,
} from "../../ai/visual-pipeline.js";

/** Input submission gambar lewat reply di Asset Vault (dari webhook Telegram). */
export interface KirimanFotoAset {
  updateId: string;
  chatId: string | undefined;
  userId: string | undefined;
  replyToMessageId: number | undefined;
  fileId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export type HasilKiriman = { status: "accepted" | "rejected" | "ignored"; taskId?: string; reason?: string };

export interface KonfigurasiLayananTugasAset {
  repositoriTugas: KontrakRepositoriTugasAset;
  repositoriAset: KontrakRepositoriAsetVisual | undefined;
  vaultChatId: string | undefined;
  waktu: PenyediaWaktu;
  pembuatIdTugas: () => string;
  kirimPesan: (chatId: string, text: string, opsi?: { parseMode?: "Markdown" }) => Promise<number>;
  validasiAdminVault: (userId: string, chatId: string) => Promise<boolean>;
}

export const BESARAN_ALASAN_TOLAK_MAKS = 500;

/**
 * Layanan AssetTask — Human-in-the-Loop (Beta). Application boundary antara
 * parsing Telegram-specific (infrastructure) dan domain murni (tugas-aset.js).
 */
export class LayananTugasAset {
  constructor(private readonly cfg: KonfigurasiLayananTugasAset) {}

  /** Buat AssetTask DRAFT dari VisualPlan (kanonik). Idempotent per identity. */
  async buatTugasAset(caseId: string, caseVersionId: string, plan: VisualPlan): Promise<TugasAset> {
    const ada = await this.cfg.repositoriTugas.ambilBerdasarkanIdentitas(caseId, plan.sceneId, plan.planId);
    if (ada) return ada;

    const prompt = new PembuatPromptVisual().bangunPromptVisual(plan, { scene: plan.sceneId, caseId });
    const tugas = buatTugasAset({
      taskId: this.cfg.pembuatIdTugas(),
      caseId,
      caseVersionId,
      sceneId: plan.sceneId,
      planId: plan.planId,
      assetType: plan.purpose as TipeAsetVisual,
      prompt,
      requiredClues: plan.requiredClues.map((r) => r.id),
      status: "DRAFT",
      createdAt: this.cfg.waktu.sekarangIso(),
    });
    await this.cfg.repositoriTugas.simpan(tugas);
    return tugas;
  }

  /** Kirim task message ke vault → WAITING_FOR_ADMIN; simpan telegramMessageId. */
  async kirimTugasAset(taskId: string): Promise<TugasAset> {
    const vault = this.cfg.vaultChatId;
    if (!vault) throw new KesalahanKonfigurasi("TELEGRAM_ASSET_VAULT_CHAT_ID belum dikonfigurasi.");
    const tugas = await this.ambilTugasAset(taskId);
    if (tugas.status === "WAITING_FOR_ADMIN" && tugas.telegramMessageId) return tugas;

    const ternavigasi = hubunganKirim(tugas);
    const messageId = await this.cfg.kirimPesan(vault, bangunPesanTugas(ternavigasi), { parseMode: "Markdown" });
    const t2: TugasAset = {
      ...ternavigasi,
      status: "WAITING_FOR_ADMIN",
      telegramMessageId: String(messageId),
      updatedAt: this.cfg.waktu.sekarangIso(),
    };
    await this.cfg.repositoriTugas.simpan(t2);
    return t2;
  }

  /** Kirim ulang pesan task (misal pesan lama hilang/gagal). Kirim pesan baru + update messageId. */
  async kirimUlangTugasAset(taskId: string): Promise<TugasAset> {
    const vault = this.cfg.vaultChatId;
    if (!vault) throw new KesalahanKonfigurasi("TELEGRAM_ASSET_VAULT_CHAT_ID belum dikonfigurasi.");
    const tugas = await this.ambilTugasAset(taskId);
    if (tugas.status === "VERIFIED") throw new KesalahanValidasi("AssetTask VERIFIED immutable; gunakan revisi/task baru.");

    const ternavigasi = hubunganKirim({ ...tugas, status: tugas.status === "DRAFT" ? "DRAFT" : "WAITING_FOR_ADMIN" });
    const messageId = await this.cfg.kirimPesan(vault, bangunPesanTugas(ternavigasi), { parseMode: "Markdown" });
    const t2: TugasAset = {
      ...ternavigasi,
      status: "WAITING_FOR_ADMIN",
      telegramMessageId: String(messageId),
      updatedAt: this.cfg.waktu.sekarangIso(),
    };
    delete t2.telegramFileId;
    delete t2.submittedAt;
    delete t2.submittedBy;
    await this.cfg.repositoriTugas.simpan(t2);
    return t2;
  }

  /** Proses submission foto reply dari webhook Telegram (idempotent). */
  async terimaPengirimanAset(input: KirimanFotoAset): Promise<HasilKiriman> {
    const vault = this.cfg.vaultChatId;
    if (!vault || input.chatId !== vault) return { status: "ignored", reason: "bukan vault chat" };
    if (!input.replyToMessageId || input.replyToMessageId <= 0) return { status: "ignored", reason: "bukan reply message" };
    const tugas = await this.cfg.repositoriTugas.ambilBerdasarkanMessage(String(input.replyToMessageId));
    if (!tugas) return { status: "ignored", reason: "reply tanpa AssetTask (random image)" };
    if (!input.userId) return { status: "rejected", reason: "tanpa pengirim", taskId: tugas.taskId };
    const admin = await this.cfg.validasiAdminVault(input.userId, input.chatId);
    if (!admin) return { status: "rejected", reason: "bukan admin vault", taskId: tugas.taskId };
    if (!dapatTerimaKiriman(tugas.status)) {
      return {
        status: "rejected",
        reason: tugas.status === "VERIFIED" ? "task sudah VERIFIED (immutable)" : "status tidak menerima submission",
        taskId: tugas.taskId,
      };
    }
    const fileId = input.fileId.trim();
    if (!fileId) return { status: "rejected", reason: "tanpa file_id photo", taskId: tugas.taskId };
    if (input.sizeBytes !== undefined && input.sizeBytes > UKURAN_MAKS_GAMBAR_BYTES) {
      return { status: "rejected", reason: "ukuran gambar melebihi batas", taskId: tugas.taskId };
    }
    if (tugas.status === "SUBMITTED" && tugas.telegramFileId === fileId) {
      return { status: "accepted", taskId: tugas.taskId };
    }

    const t2: TugasAset = {
      ...(tugas.status === "SUBMITTED" ? tugas : transisiTugasAset(tugas, "SUBMITTED")),
      telegramFileId: fileId,
      submittedBy: input.userId,
      submittedAt: this.cfg.waktu.sekarangIso(),
      sizeBytes: input.sizeBytes !== undefined && Number.isFinite(input.sizeBytes) && input.sizeBytes > 0 ? input.sizeBytes : 1000,
      updatedAt: this.cfg.waktu.sekarangIso(),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
    };
    delete (t2 as { rejectionReason?: string }).rejectionReason;
    await this.cfg.repositoriTugas.simpan(t2);
    return { status: "accepted", taskId: tugas.taskId };
  }

  /** VERIFYING → VERIFIED; membangun AsetVisual TELEGRAM_BETA + manifest. Idempotent. */
  async verifikasiTugasAset(taskId: string): Promise<TugasAset> {
    const tugas = await this.ambilTugasAset(taskId);
    if (tugas.status === "VERIFIED") return tugas;
    if (tugas.status !== "SUBMITTED" && tugas.status !== "VERIFYING") {
      throw new KesalahanValidasi("Hanya AssetTask SUBMITTED/VERIFYING yang dapat diverifikasi.");
    }
    if (!tugas.telegramFileId) throw new KesalahanValidasi("AssetTask belum memiliki file_id submission.");

    const repo = this.cfg.repositoriAset;
    if (repo) {
      const ada = await repo.ambil(identitasTugasAset(tugas.caseId, tugas.sceneId, tugas.planId));
      if (ada && ada.uri !== tugas.telegramFileId) {
        throw new KesalahanValidasi("Aset VERIFIED sudah ada utk identity ini; perubahan butuh explicit revision/task baru.");
      }
    }

    const menujuVerifying = tugas.status === "VERIFYING" ? tugas : transisiTugasAset(tugas, "VERIFYING");
    const tVerifikasi: TugasAset = {
      ...transisiTugasAset(menujuVerifying, "VERIFIED"),
      verifiedAt: this.cfg.waktu.sekarangIso(),
      updatedAt: this.cfg.waktu.sekarangIso(),
    };
    await this.cfg.repositoriTugas.simpan(tVerifikasi);

    if (repo) {
      await simpanReferensiAset(repo, tugas.caseId, bangunAsetDariTugas(tVerifikasi));
    }
    return tVerifikasi;
  }

  /** Reject → REJECTED → WAITING_FOR_ADMIN; reason bounded. */
  async tolakTugasAset(taskId: string, reason: string): Promise<TugasAset> {
    const tugas = await this.ambilTugasAset(taskId);
    if (tugas.status === "VERIFIED") throw new KesalahanValidasi("AssetTask VERIFIED immutable; gunakan revisi/task baru.");
    if (tugas.status !== "SUBMITTED" && tugas.status !== "VERIFYING" && tugas.status !== "WAITING_FOR_ADMIN") {
      throw new KesalahanValidasi("AssetTask dalam status ini tidak dapat ditolak.");
    }
    const bounded = reason.trim().slice(0, BESARAN_ALASAN_TOLAK_MAKS) || "tanpa alasan";
    const terReject = transisiTugasAset(tugas, "REJECTED");
    const t2: TugasAset = {
      ...transisiTugasAset({ ...terReject, rejectionReason: bounded }, "WAITING_FOR_ADMIN"),
      updatedAt: this.cfg.waktu.sekarangIso(),
    };
    delete t2.telegramFileId;
    delete t2.submittedAt;
    delete t2.submittedBy;
    await this.cfg.repositoriTugas.simpan(t2);
    return t2;
  }

  async ambilTugasAset(taskId: string): Promise<TugasAset> {
    if (!taskId) throw new KesalahanValidasi("taskId wajib diisi.");
    const tugas = await this.cfg.repositoriTugas.ambil(taskId);
    if (!tugas) throw new KesalahanValidasi(`AssetTask tidak ditemukan: ${taskId}`);
    return tugas;
  }
}

// Transisi DRAFT → WAITING_FOR_ADMIN utk dikirim.
function hubunganKirim(tugas: TugasAset): TugasAset {
  if (tugas.status === "DRAFT") return transisiTugasAset(tugas, "WAITING_FOR_ADMIN");
  if (tugas.status === "WAITING_FOR_ADMIN") return tugas;
  throw new KesalahanValidasi("AssetTask hanya dapat dikirim dari status DRAFT (atau WAITING_FOR_ADMIN).");
}

function bangunPesanTugas(t: TugasAset): string {
  const promptAman = t.prompt.replace(/```/g, "'''");
  const idAman = (id: string): string => "`" + id.replace(/`/g, "") + "`";
  return [
    `[ASSET TASK] ${idAman(t.taskId)}`,
    `Case: ${idAman(t.caseId)}`,
    `CaseVersion: ${idAman(t.caseVersionId)}`,
    `Scene: ${idAman(t.sceneId)}`,
    `Asset Type: ${t.assetType}`,
    `Required visual clues: ${t.requiredClues.join(", ") || "none"}`,
    ``,
    "Prompt (tap to copy):",
    "```",
    promptAman,
    "```",
    ``,
    `Balas pesan ini dengan hasil gambar.`,
  ].join("\n");
}

function bangunAsetDariTugas(t: TugasAset): AsetVisual {
  const format: FormatAsetVisual = "image/jpeg";
  const sizeBytes = t.sizeBytes !== undefined && t.sizeBytes > 0 ? t.sizeBytes : 1000;
  const aset: AsetVisual = {
    assetId: `ASSET-${t.planId}`,
    planId: t.planId,
    sceneId: t.sceneId,
    caseId: t.caseId,
    provider: "TELEGRAM_BETA",
    uri: t.telegramFileId ?? "",
    status: "READY",
    format,
    sizeBytes,
    requiredClues: t.requiredClues,
    forbiddenClues: [],
    verifyNotes: ["VERIFIED_BY_ADMIN"],
    createdAt: t.createdAt,
    storageProvider: "TELEGRAM_BETA",
    durability: "BEST_EFFORT",
    updatedAt: t.updatedAt,
    mimeType: format,
    ...(t.verifiedAt !== undefined ? { verifiedAt: t.verifiedAt } : {}),
  };
  if (t.width !== undefined) aset.width = t.width;
  if (t.height !== undefined) aset.height = t.height;
  return aset;
}