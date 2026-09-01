import type { SesiKasus } from "../entities.js";
import type { WaktuIso } from "../../fondasi/primitif.js";
import { StatusSesi, HasilSesi } from "../enums.js";
import { KesalahanValidasi, KesalahanAutorisasi } from "../../fondasi/eror.js";
import type { CaseBible } from "../../kasus/case-bible.js";
export type { ProposalTuduhan, TuduhanAkhir, StatusProposalTuduhan } from "../kontrak-resolusi.js";
import type { ProposalTuduhan, TuduhanAkhir } from "../kontrak-resolusi.js";

function hitungKuorum(jumlahDetektifAktif: number): number {
  if (jumlahDetektifAktif <= 1) return 1;
  return Math.floor(jumlahDetektifAktif / 2) + 1;
}

export function ajukanTuduhan(
  sesi: SesiKasus,
  actorUserId: string,
  suspectId: string,
  waktuSekarang: WaktuIso,
  opsi?: { motiveId?: string | null; methodId?: string | null },
): { sesi: SesiKasus; proposal: ProposalTuduhan } {
  validasiSesiTerbuka(sesi);
  validasiDetektif(sesi, actorUserId);

  const existing = (sesi as any).accusationProposal as ProposalTuduhan | null | undefined;
  if (existing && existing.status !== "REJECTED" && existing.status !== "EXPIRED") {
    if (existing.status === "FINALIZED") {
      throw new KesalahanValidasi("Sesi sudah memiliki final accusation.");
    }
    // Replace/withdraw sebelumnya diperbolehkan (SCORE-07) — proposal baru mengganti yang lama.
  }

  const proposal: ProposalTuduhan = {
    proposalId: `proposal-${String(sesi.sessionId)}-${waktuSekarang}`,
    sessionId: String(sesi.sessionId),
    suspectId,
    motiveId: opsi?.motiveId ?? null,
    methodId: opsi?.methodId ?? null,
    proposerId: actorUserId,
    votes: [],
    status: "OPEN",
    createdAt: waktuSekarang,
  };

  return {
    sesi: { ...sesi, accusationProposal: proposal, lastActivityAt: waktuSekarang, updatedAt: waktuSekarang } as SesiKasus,
    proposal,
  };
}

export function berikanSuaraTuduhan(
  sesi: SesiKasus,
  actorUserId: string,
  waktuSekarang: WaktuIso,
): { sesi: SesiKasus; proposal: ProposalTuduhan; baruQualified: boolean; suaraBaru: boolean } {
  validasiSesiTerbuka(sesi);
  validasiDetektif(sesi, actorUserId);

  const proposal = (sesi as any).accusationProposal as ProposalTuduhan | null | undefined;
  if (!proposal || proposal.status === "FINALIZED" || proposal.status === "REJECTED" || proposal.status === "EXPIRED") {
    throw new KesalahanValidasi("Tidak ada proposal accusation aktif untuk divote.");
  }

  if (proposal.votes.includes(actorUserId)) {
    // Idempotent: vote ulang tidak menghasilkan efek tambahan.
    return { sesi, proposal, baruQualified: false, suaraBaru: false };
  }

  const votesBaru = [...proposal.votes, actorUserId];
  const kuorum = hitungKuorum(sesi.playerIds.length);
  const qualifiedSekarang = votesBaru.length >= kuorum;

  const proposalBaru: ProposalTuduhan = {
    ...proposal,
    votes: votesBaru,
    status: qualifiedSekarang ? "QUALIFIED" : proposal.status,
    qualifiedAt: qualifiedSekarang ? waktuSekarang : proposal.qualifiedAt,
  };

  return {
    sesi: { ...sesi, accusationProposal: proposalBaru, lastActivityAt: waktuSekarang, updatedAt: waktuSekarang } as SesiKasus,
    proposal: proposalBaru,
    baruQualified: qualifiedSekarang && proposal.status !== "QUALIFIED",
    suaraBaru: true,
  };
}

/**
 * Finalisasi tuduhan — fungsi murni; pemanggil WAJIB menjalankan ini di dalam
 * Firestore transaction dengan snapshot sesi terkini, agar dua finalize
 * bersamaan hanya menghasilkan satu commit sukses (retry kedua akan melihat
 * finalAccusation sudah terisi dan gagal validasi).
 */
export function finalisasiTuduhan(
  sesi: SesiKasus,
  caseBible: CaseBible,
  waktuSekarang: WaktuIso,
): { sesi: SesiKasus; tuduhanAkhir: TuduhanAkhir; sudahFinalSebelumnya: boolean } {
  validasiSesiTerbuka(sesi);

  const existingFinal = (sesi as any).finalAccusation as TuduhanAkhir | null | undefined;
  if (existingFinal) {
    return { sesi, tuduhanAkhir: existingFinal, sudahFinalSebelumnya: true };
  }

  const proposal = (sesi as any).accusationProposal as ProposalTuduhan | null | undefined;
  if (!proposal || proposal.status !== "QUALIFIED") {
    throw new KesalahanValidasi("Proposal belum qualified — tidak dapat difinalisasi.");
  }

  const correctCulprit = proposal.suspectId === caseBible.culpritSuspectId;

  const tuduhanAkhir: TuduhanAkhir = {
    suspectId: proposal.suspectId,
    motiveId: proposal.motiveId ?? null,
    methodId: proposal.methodId ?? null,
    resolvedAt: waktuSekarang,
    correctCulprit,
  };

  const proposalFinal: ProposalTuduhan = { ...proposal, status: "FINALIZED" };

  const sesiSelesai: SesiKasus = {
    ...sesi,
    status: StatusSesi.CLEARED,
    outcome: correctCulprit ? HasilSesi.SOLVED : HasilSesi.FAILED,
    accusationProposal: proposalFinal,
    finalAccusation: tuduhanAkhir,
    solvedAt: correctCulprit ? waktuSekarang : sesi.solvedAt,
    updatedAt: waktuSekarang,
  } as SesiKasus;

  return { sesi: sesiSelesai, tuduhanAkhir, sudahFinalSebelumnya: false };
}

function validasiSesiTerbuka(sesi: SesiKasus): void {
  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanValidasi("Accusation hanya valid ketika sesi OPEN.");
  }
}

function validasiDetektif(sesi: SesiKasus, userId: string): void {
  if (!sesi.playerIds.includes(userId as any)) {
    throw new KesalahanAutorisasi("Hanya detective aktif yang dapat melakukan aksi ini.");
  }
}

export { hitungKuorum };