import type { Transaction } from "firebase-admin/firestore";
import { KesalahanAutorisasi, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import type { IdKasus, IdPemain, IdSesiKasus, IdVersiKasus, WaktuIso } from "../../fondasi/primitif.js";
import type { SesiKasus } from "../../domain/entities.js";
import type { KejadianDomain } from "../../event/domain.js";
import { JenisKejadianDomain } from "../../event/domain.js";
import type { KontrakRepositoriCaseBible } from "../../kasus/case-bible-repository.js";
import type { CaseBible } from "../../kasus/case-bible.js";
import type { VersiKasus } from "../../kasus/versi-kasus.js";
import {
  selidikiAdegan,
  periksaObjek,
  type HasilSelidikiAdegan,
  type HasilPeriksaObjek,
} from "../../domain/services/investigasi.js";

export interface RepositoriSesiInvestigasi {
  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface PenerbitEventInvestigasi {
  kirim(event: KejadianDomain): Promise<void>;
}

export interface PenyediaWaktuInvestigasi {
  sekarangIso(): WaktuIso;
}

export interface KonfigurasiLayananInvestigasi {
  repositoriSesi: RepositoriSesiInvestigasi;
  repositoriCaseBible: KontrakRepositoriCaseBible;
  repositoriVersiKasus?: { ambilVersiKasus(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null> };
  penerbitEventDomain: PenerbitEventInvestigasi;
  waktu: PenyediaWaktuInvestigasi;
}

export interface RequestSelidikiAdegan {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  sceneId: string;
}

export interface RequestPeriksaObjek {
  sessionId: IdSesiKasus;
  userId: IdPemain;
  objectId: string;
}

/**
 * Layanan investigasi: mengorkestrasi selidikiAdegan (read-only) dan
 * periksaObjek (transactional) di atas domain services murni.
 *
 * Tidak ada Telegram/AI call di dalam transaction — hanya Firestore read/write.
 */
export class LayananInvestigasiKasus {
  constructor(private readonly konfigurasi: KonfigurasiLayananInvestigasi) {}

  async prosesInvestigasiAdegan(request: RequestSelidikiAdegan): Promise<HasilOperasi<HasilSelidikiAdegan, Error>> {
    try {
      const sesi = await this.konfigurasi.repositoriSesi.ambil(request.sessionId);
      if (!sesi) {
        return gagal(new KesalahanValidasi("Sesi kasus tidak ditemukan."));
      }

      this.validasiPartisipan(sesi, request.userId);

      const caseBible = await this.ambilCaseBibleUntukSesi(sesi);
      const hasil = selidikiAdegan(sesi, caseBible, request.sceneId);

      return berhasil(hasil);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  async prosesPeriksaObjek(request: RequestPeriksaObjek): Promise<HasilOperasi<HasilPeriksaObjek, Error>> {
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

        const hasilPeriksa = periksaObjek(sesiTerkini, caseBible, request.objectId, request.userId, waktuSekarang);

        // Hanya menulis jika benar-benar ada perubahan state (bukan no-op duplicate).
        if (hasilPeriksa.sesi !== sesiTerkini) {
          await this.konfigurasi.repositoriSesi.simpan(hasilPeriksa.sesi, transaction);
        }

        return hasilPeriksa;
      });

      // Post-commit: event hanya dikirim jika evidence baru benar-benar ditemukan
      // pada panggilan ini — mencegah duplicate EVIDENCE_DISCOVERED event.
      if (hasil.evidenceBaruDitemukan && hasil.evidenceId) {
        const event: KejadianDomain = {
          eventId: `evt-${Date.now()}-${request.objectId}` as any,
          eventVersion: 1,
          sessionId: request.sessionId,
          groupId: sesiAwal.groupId,
          actorUserId: request.userId,
          type: JenisKejadianDomain.EVIDENCE_DISCOVERED,
          payload: {
            evidenceId: hasil.evidenceId,
            objectId: request.objectId,
            discoveredBy: String(request.userId),
          },
          actionId: null,
          occurredAt: waktuSekarang,
        };

        await this.konfigurasi.penerbitEventDomain.kirim(event);
      }

      return berhasil(hasil);
    } catch (error) {
      return this.tanganiError(error);
    }
  }

  private validasiPartisipan(sesi: SesiKasus, userId: IdPemain): void {
    if (!sesi.playerIds.includes(userId)) {
      throw new KesalahanAutorisasi("Hanya detective aktif yang dapat melakukan aksi investigasi.");
    }
  }

  /**
   * Case Bible bersifat immutable per CaseVersion sehingga aman dibaca di luar
   * transaction — sama seperti pembacaan CaseVersion published lainnya.
   * Resolusi via VersiKasus.caseBibleRef (otoritatif); fallback konvensi
   * `case-bible:{caseId}:golden` hanya bila repo versi tak tersedia/versi hilang.
   */
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

  private tanganiError(error: unknown): HasilOperasi<never, Error> {
    if (error instanceof Error) {
      return gagal(error);
    }
    return gagal(new KesalahanValidasi("Gagal memproses aksi investigasi."));
  }
}

export function buatLayananInvestigasiKasus(konfigurasi: KonfigurasiLayananInvestigasi): LayananInvestigasiKasus {
  return new LayananInvestigasiKasus(konfigurasi);
}