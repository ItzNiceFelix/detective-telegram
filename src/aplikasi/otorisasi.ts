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
