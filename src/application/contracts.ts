import type { DomainEvent } from "../event/contracts.js";
import type { Grup, Pengguna, SesiKasus, VersiKasus } from "../domain/entities.js";
import type { IdGrup, IdKasus, IdPemain, IdSesiKasus, IdVersiKasus } from "../domain/types.js";
import type { StatusSesi } from "../domain/enums.js";

export interface LayananKasus {
  ambilVersiKasus(caseId: IdKasus, versionId?: IdVersiKasus): Promise<VersiKasus | null>;
  buatSesiKasus(grupId: IdGrup, caseId: IdKasus, caseVersionId: IdVersiKasus): Promise<SesiKasus>;
}

export interface LayananAkses {
  validasiAksesPemain(userId: IdPemain, sesi: SesiKasus): Promise<boolean>;
  validasiStatusSesi(sesi: SesiKasus, statusDiperbolehkan: StatusSesi[]): Promise<boolean>;
}

export interface LayananEvent {
  catat(event: DomainEvent): Promise<void>;
}

export interface LayananPengguna {
  ambilPengguna(userId: IdPemain): Promise<Pengguna | null>;
  buatPengguna(data: Omit<Pengguna, "userId"> & { userId: IdPemain }): Promise<Pengguna>;
}

export interface LayananGrup {
  ambilGrup(groupId: IdGrup): Promise<Grup | null>;
  simpanGrup(grup: Grup): Promise<Grup>;
}

export interface LayananSesiKasus {
  ambilSesiKasus(sessionId: IdSesiKasus): Promise<SesiKasus | null>;
  simpanSesiKasus(sesi: SesiKasus): Promise<SesiKasus>;
}
