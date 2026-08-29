import type { Grup, Pengguna, SesiKasus, VersiKasus } from "../domain/entities.js";
import type { IdGrup, IdKasus, IdPemain, IdSesiKasus, IdVersiKasus } from "../domain/types.js";

export interface RepositoriPengguna {
  ambil(userId: IdPemain): Promise<Pengguna | null>;
  simpan(pengguna: Pengguna): Promise<Pengguna>;
}

export interface RepositoriGrup {
  ambil(groupId: IdGrup): Promise<Grup | null>;
  simpan(grup: Grup): Promise<Grup>;
}

export interface RepositoriKasus {
  ambilKasus(caseId: IdKasus): Promise<VersiKasus | null>;
  ambilVersi(caseId: IdKasus, versionId: IdVersiKasus): Promise<VersiKasus | null>;
  simpanVersi(kasus: VersiKasus): Promise<VersiKasus>;
}

export interface RepositoriSesiKasus {
  ambil(sessionId: IdSesiKasus): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus): Promise<SesiKasus>;
}

export interface RepositoriKejadian {
  simpan(event: unknown): Promise<void>;
}
