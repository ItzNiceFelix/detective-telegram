import type { Transaction } from "firebase-admin/firestore";
import { KesalahanAutorisasi, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import type { IdKasus, IdPemain, IdSesiKasus, IdVersiKasus, WaktuIso } from "../../fondasi/primitif.js";
import type { VersiKasus } from "../../kasus/versi-kasus.js";
import type { SesiKasus } from "../../domain/entities.js";
import type { KejadianDomain } from "../../event/domain.js";
import { JenisKejadianDomain } from "../../event/domain.js";
import type { KontrakRepositoriCaseBible } from "../../kasus/case-bible-repository.js";
import type { CaseBible, MaksudInterogasi } from "../../kasus/case-bible.js";
import { interogasiTersangka, type HasilInterogasi } from "../../domain/services/interogasi.js";
import { konfrontasikanBukti, type HasilKonfrontasi } from "../../domain/services/konfrontasi.js";
import { ambilPeristiwaLinimasa } from "../../domain/services/linimasa.js";
import { evaluasiGrafPembuktian, type StatusDukunganBukti } from "../../domain/services/graf-pembuktian.js";
import type { PintuRendererNaratif } from "../../domain/services/renderer-naratif.js";
import type { PeristiwaLinimasa } from "../../kasus/case-bible.js";

export interface RepositoriSesiInterogasi {
  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface PenerbitEventInterogasi {
  kirim(event: KejadianDomain): Promise<void>;
}

export interface PenyediaWaktuInterogasi {
  sekarangIso(): WaktuIso;
}

export interface KonfigurasiLayananInterogasi {
  repositoriSesi: RepositoriSesiInterogasi;
  repositoriCaseBible: KontrakRepositoriCaseBible;
  repositoriVersiKasus?: { ambilVersiKasus(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null> };
  penerbitEventDomain: PenerbitEventInterogasi;
  waktu: PenyediaWaktuInterogasi;
  renderer: PintuRendererNaratif;
}

export interface RequestInterogasi {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  suspectId: string;
  maksud: MaksudInterogasi;
}

export interface RequestKonfrontasi {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  suspectId: string;
  evidenceId: string;
}

export interface RequestLinimasa {
  sessionId: IdSesiKasus;
  userId: IdPemain;
}

export interface RequestEvaluasiBukti {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  proofNodeId: string;
}

export class LayananInterogasiKasus {
  constructor(private readonly konfigurasi: KonfigurasiLayananInterogasi) {}

  async prosesInterogasi(request: RequestInterogasi): Promise<HasilOperasi<HasilInterogasi, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) {
        return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));
      }

      this.validasiPartisipan(sesiAwal, request.userId);

      const caseBible = await this.ambilCaseBibleUntukSesi(sesiAwal);
      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) {
          throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");
        }

        const hasilInterogasi = interogasiTersangka(
          sesiTerkini,
          caseBible,
          this.konfigurasi.renderer,
          request.suspectId,
          request.maksud,
          request.userId,
          waktuSekarang,
        );

        if (hasilInterogasi.sesi !== sesiTerkini) {
          await this.konfigurasi.repositoriSesi.simpan(hasilInterogasi.sesi, transaction);
        }

        return hasilInterogasi;
      });

      if (hasil.nodeBaruDiunlock) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.CONFRONTATION_SUCCESS === undefined ? JenisKejadianDomain.STATEMENT_UNLOCKED : JenisKejadianDomain.STATEMENT_UNLOCKED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            nodeId: hasil.node.nodeId,
            suspectId: request.suspectId,
            statementId: hasil.statementBaruDiunlock ? hasil.node.unlocksStatementId : undefined,
          }),
        );
      }

      return berhasil(hasil);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesKonfrontasi(request: RequestKonfrontasi): Promise<HasilOperasi<HasilKonfrontasi, Error>> {
    try {
      const sesiAwal = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesiAwal) {
        return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));
      }

      this.validasiPartisipan(sesiAwal, request.userId);

      const caseBible = await this.ambilCaseBibleUntukSesi(sesiAwal);
      const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

      const hasil = await this.konfigurasi.repositoriSesi.transaksi(async (transaction) => {
        const sesiTerkini = await this.konfigurasi.repositoriSesi.ambil(request.sessionId, transaction);
        if (!sesiTerkini) {
          throw new KesalahanValidasi("Sesi kasus tidak ditemukan.");
        }

        const hasilKonfrontasi = konfrontasikanBukti(sesiTerkini, caseBible, request.suspectId, request.evidenceId, waktuSekarang);

        if (hasilKonfrontasi.sesi !== sesiTerkini) {
          await this.konfigurasi.repositoriSesi.simpan(hasilKonfrontasi.sesi, transaction);
        }

        return hasilKonfrontasi;
      });

      // CONFRONTATION_SUCCESS selalu dikirim untuk confrontation valid yang
      // benar-benar diproses (bukan duplicate) — terlepas dari apakah
      // menghasilkan kontradiksi. Kontradiksi adalah event terpisah.
      if (!hasil.sudahDikonfrontasiSebelumnya) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.CONFRONTATION_SUCCESS, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            suspectId: request.suspectId,
            evidenceId: request.evidenceId,
          }),
        );
      }

      if (hasil.kontradiksiBaruDitemukan && hasil.contradictionId) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.CONTRADICTION_FOUND, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            contradictionId: hasil.contradictionId,
            suspectId: request.suspectId,
            evidenceId: request.evidenceId,
          }),
        );
      }

      if (hasil.timelineBaruDiketahui) {
        await this.konfigurasi.penerbitEventDomain.kirim(
          this.buatEvent(JenisKejadianDomain.TIMELINE_KNOWLEDGE_GAINED, sesiAwal, request.sessionId, request.userId, waktuSekarang, {
            suspectId: request.suspectId,
          }),
        );
      }

      return berhasil(hasil);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesAmbilLinimasa(request: RequestLinimasa): Promise<HasilOperasi<PeristiwaLinimasa[], Error>> {
    try {
      const sesi = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesi) {
        return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));
      }

      this.validasiPartisipan(sesi, request.userId);

      const caseBible = await this.ambilCaseBibleUntukSesi(sesi);
      return berhasil(ambilPeristiwaLinimasa(sesi, caseBible));
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesEvaluasiBukti(request: RequestEvaluasiBukti): Promise<HasilOperasi<StatusDukunganBukti, Error>> {
    try {
      const sesi = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesi) {
        return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));
      }

      this.validasiPartisipan(sesi, request.userId);

      const caseBible = await this.ambilCaseBibleUntukSesi(sesi);
      return berhasil(evaluasiGrafPembuktian(sesi, caseBible, request.proofNodeId));
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  private validasiPartisipan(sesi: SesiKasus, userId: IdPemain): void {
    if (!sesi.playerIds.includes(userId)) {
      throw new KesalahanAutorisasi("Hanya detective aktif yang dapat melakukan aksi ini.");
    }
  }

  private async ambilCaseBibleUntukSesi(sesi: SesiKasus): Promise<CaseBible> {
    const repoVersi = this.konfigurasi.repositoriVersiKasus;
    if (repoVersi) {
      const versi = await repoVersi.ambilVersiKasus(sesi.caseId as IdKasus, sesi.caseVersionId as IdVersiKasus);
      if (versi?.caseBibleRef) {
        const caseBible = await this.konfigurasi.repositoriCaseBible.ambilCaseBible(versi.caseBibleRef);
        if (caseBible) return caseBible;
      }
    }
    const ref = `case-bible:${String(sesi.caseId)}:golden`;
    const caseBible = await this.konfigurasi.repositoriCaseBible.ambilCaseBible(ref);

    if (!caseBible) {
      throw new KesalahanValidasi("Case Bible tidak ditemukan untuk sesi ini.");
    }

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
    if (error instanceof Error) {
      return gagal(error);
    }
    return gagal(new KesalahanValidasi("Gagal memproses aksi interogasi."));
  }
}

export function buatLayananInterogasiKasus(konfigurasi: KonfigurasiLayananInterogasi): LayananInterogasiKasus {
  return new LayananInterogasiKasus(konfigurasi);
}