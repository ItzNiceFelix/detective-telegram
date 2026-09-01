import type { Transaction } from "firebase-admin/firestore";
import { KesalahanAutorisasi, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import type { IdPemain, IdSesiKasus, WaktuIso } from "../../fondasi/primitif.js";
import type { SesiKasus } from "../../domain/entities.js";
import type { KejadianDomain } from "../../event/domain.js";
import { JenisKejadianDomain } from "../../event/domain.js";
import type { KontrakRepositoriCaseBible } from "../../kasus/case-bible-repository.js";
import type { CaseBible } from "../../kasus/case-bible.js";
import { buatAtauPerbaruiTeori, type TeoriKasus } from "../../domain/services/teori.js";
import {
  ajukanTuduhan,
  berikanSuaraTuduhan,
  finalisasiTuduhan,
  type ProposalTuduhan,
  type TuduhanAkhir,
} from "../../domain/services/tuduhan.js";
import { hitungSkorKasus, hitungKontribusiPemain, BOBOT_SKOR, type KontribusiPemain } from "../../domain/services/skor.js";
import type { SnapshotPenyelesaian } from "../../domain/kontrak-resolusi.js";

export interface RepositoriSesiResolusi {
  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface RepositoriKontribusi {
  ambilSemuaUntukSesi(sessionId: IdSesiKasus): Promise<KontribusiPemain[]>;
  tambahJikaBaru(sessionId: IdSesiKasus, kontribusi: KontribusiPemain, transaction?: Transaction): Promise<boolean>;
}

export interface PenerbitEventResolusi {
  kirim(event: KejadianDomain): Promise<void>;
}

export interface PenyediaWaktuResolusi {
  sekarangIso(): WaktuIso;
}

export interface RepositoriSnapshotResolusi {
  simpan(snapshot: SnapshotPenyelesaian): Promise<void>;
}

export interface KonfigurasiLayananResolusi {
  repositoriSesi: RepositoriSesiResolusi;
  repositoriCaseBible: KontrakRepositoriCaseBible;
  repositoriKontribusi: RepositoriKontribusi;
  repositoriSnapshot: RepositoriSnapshotResolusi;
  penerbitEventDomain: PenerbitEventResolusi;
  waktu: PenyediaWaktuResolusi;
}

export interface RequestPerbaruiTeori {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  culpritSuspectId?: string | null;
  motiveId?: string | null;
  methodId?: string | null;
  timelineHypothesisEventIds?: string[];
  evidenceRefs?: string[];
}

export interface RequestAjukanTuduhan {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  suspectId: string;
  motiveId?: string | null;
  methodId?: string | null;
}

export interface RequestVoteTuduhan {
  sessionId: IdSesiKasus;
  userId: IdPemain;
}

export interface RequestFinalisasiTuduhan {
  sessionId: IdSesiKasus;
  userId: IdPemain;
}

export class LayananResolusiKasus {
  constructor(private readonly konfigurasi: KonfigurasiLayananResolusi) {}

  async prosesPerbaruiTeori(request: RequestPerbaruiTeori): Promise<HasilOperasi<TeoriKasus, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));

      const caseBible = await this.ambilCaseBibleUntukSesi(sesiAwal);
      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");

        const hasilTeori = buatAtauPerbaruiTeori(
          sesiTerkini,
          caseBible,
          String(request.userId),
          {
            culpritSuspectId: request.culpritSuspectId,
            motiveId: request.motiveId,
            methodId: request.methodId,
            timelineHypothesisEventIds: request.timelineHypothesisEventIds,
            evidenceRefs: request.evidenceRefs,
          },
          waktuSekarang,
        );

        await this.konfigurasi.repositoriSesi.simpan(hasilTeori.sesi, transaction);
        return hasilTeori;
      });

      await this.konfigurasi.penerbitEventDomain.kirim(
        this.buatEvent(JenisKejadianDomain.THEORY_UPDATED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
          support: hasil.teori.support,
        }),
      );

      // Contribution: hanya jika theory mencapai STRONG/PROVEN untuk pertama kali —
      // dedupe via repositoriKontribusi mencegah reward berulang.
      if (hasil.teori.support === "STRONG" || hasil.teori.support === "PROVEN") {
        await this.berikanKontribusiJikaBaru(request.sessionId, {
          playerId: String(request.userId),
          type: "THEORY_CONTRIBUTION",
          sourceEventId: `theory:${hasil.teori.theoryId}:${hasil.teori.support}`,
          points: BOBOT_SKOR.THEORY_CONTRIBUTION,
        });
      }

      return berhasil(hasil.teori);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesAjukanTuduhan(request: RequestAjukanTuduhan): Promise<HasilOperasi<ProposalTuduhan, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));

      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");

        const hasilProposal = ajukanTuduhan(sesiTerkini, String(request.userId), request.suspectId, waktuSekarang, {
          motiveId: request.motiveId,
          methodId: request.methodId,
        });

        await this.konfigurasi.repositoriSesi.simpan(hasilProposal.sesi, transaction);
        return hasilProposal;
      });

      await this.konfigurasi.penerbitEventDomain.kirim(
        this.buatEvent(JenisKejadianDomain.ACCUSATION_PROPOSED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
          suspectId: request.suspectId,
          proposalId: hasil.proposal.proposalId,
        }),
      );

      return berhasil(hasil.proposal);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesVoteTuduhan(request: RequestVoteTuduhan): Promise<HasilOperasi<ProposalTuduhan, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));

      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");

        const hasilVote = berikanSuaraTuduhan(sesiTerkini, String(request.userId), waktuSekarang);

        if (hasilVote.suaraBaru) {
          await this.konfigurasi.repositoriSesi.simpan(hasilVote.sesi, transaction);
        }
        return hasilVote;
      });

      if (hasil.suaraBaru) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.ACCUSATION_QUALIFIED === undefined ? JenisKejadianDomain.ACCUSATION_PROPOSED : JenisKejadianDomain.ACCUSATION_PROPOSED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            proposalId: hasil.proposal.proposalId,
            voteCount: hasil.proposal.votes.length,
            action: "VOTED",
          }),
        );
      }

      if (hasil.baruQualified) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.ACCUSATION_QUALIFIED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            proposalId: hasil.proposal.proposalId,
          }),
        );
      }

      return berhasil(hasil.proposal);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesFinalisasiTuduhan(request: RequestFinalisasiTuduhan): Promise<HasilOperasi<TuduhanAkhir, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));

      const caseBible = await this.ambilCaseBibleUntukSesi(sesiAwal);
      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");

        const hasilFinal = finalisasiTuduhan(sesiTerkini, caseBible, waktuSekarang);

        if (!hasilFinal.sudahFinalSebelumnya) {
          await this.konfigurasi.repositoriSesi.simpan(hasilFinal.sesi, transaction);
        }
        return hasilFinal;
      });

      if (hasil.sudahFinalSebelumnya) {
        // Retry/duplicate — kembalikan hasil existing tanpa event/skor tambahan.
        return berhasil(hasil.tuduhanAkhir);
      }

      await this.konfigurasi.penerbitEventDomain.kirim(
        this.buatEvent(JenisKejadianDomain.FINAL_ACCUSATION, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
          suspectId: hasil.tuduhanAkhir.suspectId,
          correctCulprit: hasil.tuduhanAkhir.correctCulprit,
        }),
      );

      await this.konfigurasi.penerbitEventDomain.kirim(
        this.buatEvent(JenisKejadianDomain.CASE_CLEARED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
          outcome: hasil.sesi.outcome,
        }),
      );

      if (hasil.tuduhanAkhir.correctCulprit) {
        await this.berikanKontribusiJikaBaru(request.sessionId, {
          playerId: String(request.userId),
          type: "CORRECT_FINAL_RESOLUTION",
          sourceEventId: `final:${String(request.sessionId)}`,
          points: BOBOT_SKOR.CORRECT_FINAL_RESOLUTION,
        });
      }

      // Bangun resolution snapshot dari kontribusi yang sudah tercatat (bounded read).
      const semuaKontribusi = await this.konfigurasi.repositoriKontribusi.ambilSemuaUntukSesi(request.sessionId);
      const groupScore = hitungSkorKasus(semuaKontribusi, hasil.tuduhanAkhir.correctCulprit);
      const pemainUnik = Array.from(new Set(semuaKontribusi.map((k) => k.playerId)));
      const breakdown = pemainUnik.map((playerId) => ({
        playerId,
        points: hitungKontribusiPemain(semuaKontribusi, playerId),
      }));

      const snapshot: SnapshotPenyelesaian = {
        sessionId: String(request.sessionId),
        caseId: String(sesiAwal.caseId),
        finalAccusation: hasil.tuduhanAkhir,
        canonicalCulpritSuspectId: caseBible.culpritSuspectId,
        outcome: hasil.tuduhanAkhir.correctCulprit ? "SOLVED" : "FAILED",
        groupScore,
        contributionBreakdown: breakdown,
        completedAt: waktuSekarang,
      };

      await this.konfigurasi.repositoriSnapshot.simpan(snapshot);

      return berhasil(hasil.tuduhanAkhir);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  /**
   * Wrapper kontribusi idempoten: repositoriKontribusi.tambahJikaBaru harus
   * melakukan compare-and-set terhadap sourceEventId (mis. via dokumen dengan
   * ID = sourceEventId) sehingga concurrent duplicate call hanya berefek sekali.
   * Tidak transactional dengan mutation utama (post-commit side effect per §17.9).
   */
  private async berikanKontribusiJikaBaru(sessionId: IdSesiKasus, kontribusi: KontribusiPemain): Promise<void> {
    await this.konfigurasi.repositoriKontribusi.tambahJikaBaru(sessionId, kontribusi);
  }

  private async ambilCaseBibleUntukSesi(sesi: SesiKasus): Promise<CaseBible> {
    const ref = `case-bible:${String(sesi.caseId)}:golden`;
    const caseBible = await this.konfigurasi.repositoriCaseBible.ambilCaseBible(ref);
    if (!caseBible) throw new KesalahanValidasi("Case Bible tidak ditemukan untuk sesi ini.");
    return caseBible;
  }

  private buatEvent(
    type: JenisKejadianDomain,
    sesiAwal: SesiKasus,
    sessionId: IdSesiKasus,
    userId: IdPemain,
    waktuSekarang: WaktuIso,
    payload: Record<string, unknown>,
  ): KejadianDomain {
    return {
      eventId: `evt-${Date.now()}-${type}` as any,
      eventVersion: 1,
      sessionId,
      groupId: sesiAwal.groupId,
      actorUserId: userId,
      type,
      payload,
      actionId: null,
      occurredAt: waktuSekarang,
    };
  }

  private tanganiError(error: unknown): HasilOperasi<never, Error> {
    if (error instanceof Error) return gagal(error);
    return gagal(new KesalahanValidasi("Gagal memproses aksi resolusi kasus."));
  }
}

export function buatLayananResolusiKasus(konfigurasi: KonfigurasiLayananResolusi): LayananResolusiKasus {
  return new LayananResolusiKasus(konfigurasi);
}