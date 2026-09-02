import { StatusSesi, RolePemain } from "../domain/enums.js";
import type { SesiKasus } from "../domain/entities.js";
import type { IdPemain, IdSesiKasus } from "../fondasi/primitif.js";
import { KesalahanAutorisasi } from "../fondasi/eror.js";

export interface KontrakAutorisasi {
  validasi(userId: IdPemain, sessionId: IdSesiKasus): Promise<boolean>;
}

export class ValidatorAutorisasi implements KontrakAutorisasi {
  async validasi(userId: IdPemain, sessionId: IdSesiKasus): Promise<boolean> {
    if (!userId || !sessionId) {
      return false;
    }

    return true;
  }
}

export function validasiAtauTolak(validator: KontrakAutorisasi, userId: IdPemain, sessionId: IdSesiKasus): Promise<boolean> {
  return validator.validasi(userId, sessionId).then((hasil) => {
    if (!hasil) {
      throw new KesalahanAutorisasi("Pemain tidak memiliki akses yang valid untuk sesi ini.");
    }
    return hasil;
  });
}

/**
 * Eligibilitas detektif: actor wajib terdaftar sebagai detective aktif pada
 * sesi (playerIds). Penonton (spectator) dan user di luar sesi ditolak untuk
 * semua mutasi gameplay (docs/22.4, docs/26.1). Read-only (/status) tidak
 * melewati fungsi ini.
 */
export function validasiEligibilitasDetektif(sesi: SesiKasus, userId: IdPemain, peran: RolePemain = RolePemain.DETECTIVE): void {
  if (peran === RolePemain.SPECTATOR) {
    throw new KesalahanAutorisasi("Spectator tidak dapat melakukan mutasi gameplay.");
  }

  if (!sesi.playerIds.includes(userId)) {
    throw new KesalahanAutorisasi("User bukan detective aktif pada sesi ini.");
  }

  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanAutorisasi("Mutasi gameplay hanya diizinkan pada sesi berstatus OPEN.");
  }
}
