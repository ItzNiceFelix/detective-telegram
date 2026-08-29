import { StatusSesi } from "../../domain/enums.js";
import type { Grup, SesiKasus } from "../../domain/entities.js";
import { JenisKejadianDomain, type KejadianDomain } from "../../event/domain.js";
import { KesalahanValidasi, KesalahanIdempoten } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import { buatIdSesiKasus, buatWaktuIso, type IdGrup, type IdKasus, type IdPemain, type IdVersiKasus, type WaktuIso } from "../../fondasi/primitif.js";
import type { KontrakIdempoten } from "../../event/domain.js";
import type { VersiKasus } from "../../kasus/versi-kasus.js";
import { StatusVersiKasus } from "../../kasus/versi-kasus.js";
import type { PenerbitEventDomain } from "../../event/domain.js";

export interface RequestMulaiSesiKasus {
  idUpdateTelegram: string;
  caseId: IdKasus;
  caseVersionId: IdVersiKasus;
  groupId: IdGrup;
  userId: IdPemain;
  sourceActionId: string;
}

export interface RepositoriVersiKasus {
  ambilVersiKasus(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null>;
}

export interface RepositoriSesiKasus {
  ambil(sessionId: string): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface RepositoriGrup {
  ambil(groupId: IdGrup): Promise<Grup | null>;
  simpan(grup: Grup): Promise<Grup>;
}

export interface PenyediaWaktu {
  sekarangIso(): WaktuIso;
}

export interface KonfigurasiMulaiSesiKasus {
  repositoriVersiKasus: RepositoriVersiKasus;
  repositoriSesiKasus: RepositoriSesiKasus;
  repositoriGrup: RepositoriGrup;
  penerbitEventDomain: PenerbitEventDomain;
  kontrakIdempoten: KontrakIdempoten;
  waktu: PenyediaWaktu;
}

export class MulaiSesiKasusLayanan {
  constructor(private readonly konfigurasi: KonfigurasiMulaiSesiKasus) {}

  async mulaiSesiKasus(input: RequestMulaiSesiKasus): Promise<HasilOperasi<SesiKasus, Error>> {
    try {
      const caseVersion = await this.konfigurasi.repositoriVersiKasus.ambilVersiKasus(input.caseId, input.caseVersionId);

      if (!caseVersion) {
        return gagal(new KesalahanValidasi("Versi kasus tidak ditemukan."));
      }

      if (caseVersion.status !== StatusVersiKasus.PUBLISHED) {
        return gagal(new KesalahanValidasi("Versi kasus belum dipublish."));
      }

      const kunci = await this.konfigurasi.kontrakIdempoten.ambilKunci(input.sourceActionId, buatIdSesiKasus(`${input.groupId}:${input.caseId}`));
      if (kunci) {
        return gagal(new KesalahanIdempoten("Aksi start case sudah diproses."));
      }

      const grup = await this.konfigurasi.repositoriGrup.ambil(input.groupId);
      if (!grup) {
        return gagal(new KesalahanValidasi("Grup tidak ditemukan."));
      }

      const sesiBaru: SesiKasus = {
        sessionId: buatIdSesiKasus(`${input.groupId}:${input.caseId}:${input.idUpdateTelegram}`),
        caseId: input.caseId,
        caseVersionId: input.caseVersionId,
        groupId: input.groupId,
        status: StatusSesi.LOBBY,
        outcome: null,
        playerIds: [input.userId],
        discoveredEvidenceIds: [],
        examinedObjectIds: [],
        unlockedDialogueIds: [],
        teamTheory: null,
        score: 0,
        updatedAt: this.konfigurasi.waktu.sekarangIso(),
      };

      const sesiDitetapkan = await this.konfigurasi.repositoriSesiKasus.transaksi(async () => {
        const sesiAda = await this.konfigurasi.repositoriSesiKasus.ambil(sesiBaru.sessionId);
        if (sesiAda) {
          throw new KesalahanIdempoten("Sesi kasus sudah ada untuk update Telegram ini.");
        }

        const disimpan = await this.konfigurasi.repositoriSesiKasus.simpan({
          ...sesiBaru,
          status: StatusSesi.LOBBY,
        });

        const sesiMulai = {
          ...disimpan,
          status: StatusSesi.OPEN,
          startedAt: this.konfigurasi.waktu.sekarangIso(),
          lastActivityAt: this.konfigurasi.waktu.sekarangIso(),
        };

        await this.konfigurasi.kontrakIdempoten.simpanKunci({
          actionId: input.sourceActionId,
          sessionId: sesiMulai.sessionId as any,
          repeated: false,
        });

        await this.konfigurasi.repositoriSesiKasus.simpan(sesiMulai);

        return sesiMulai;
      });

      const event: KejadianDomain = {
        eventId: `evt-${Date.now()}` as any,
        eventVersion: 1,
        sessionId: sesiDitetapkan.sessionId as any,
        groupId: input.groupId,
        actorUserId: input.userId,
        type: JenisKejadianDomain.CASE_PUBLISHED,
        payload: {
          caseId: String(input.caseId),
          caseVersionId: String(input.caseVersionId),
          startedBy: String(input.userId),
        },
        actionId: input.sourceActionId,
        occurredAt: this.konfigurasi.waktu.sekarangIso(),
      };

      await this.konfigurasi.penerbitEventDomain.kirim(event);
      return berhasil(sesiDitetapkan);
    } catch (error) {
      if (error instanceof Error) {
        return gagal(error);
      }
      return gagal(new KesalahanValidasi("Gagal memulai sesi kasus."));
    }
  }
}

export function buatLayananMulaiSesiKasus(konfigurasi: KonfigurasiMulaiSesiKasus): MulaiSesiKasusLayanan {
  return new MulaiSesiKasusLayanan(konfigurasi);
}
