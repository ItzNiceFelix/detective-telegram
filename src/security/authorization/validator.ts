import { KesalahanAutorisasi } from "../../domain/errors.js";
import type { SesiKasus } from "../../domain/entities.js";
import type { IdPemain } from "../../domain/types.js";

export interface ValidatorAutorisasi {
  validasi(userId: IdPemain, sesi: SesiKasus): Promise<boolean>;
}

export class ValidatorAutorisasiImpl implements ValidatorAutorisasi {
  async validasi(userId: IdPemain, sesi: SesiKasus): Promise<boolean> {
    if (!sesi.playerIds.includes(userId)) {
      return false;
    }

    return true;
  }

  static validasiAtauTolak(userId: IdPemain, sesi: SesiKasus): Promise<boolean> {
    const validator = new ValidatorAutorisasiImpl();
    return validator.validasi(userId, sesi).then((hasil) => {
      if (!hasil) {
        throw new KesalahanAutorisasi("Pemain tidak memiliki akses ke sesi kasus ini.");
      }
      return hasil;
    });
  }
}
