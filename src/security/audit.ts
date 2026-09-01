import { KesalahanAutorisasi, KesalahanValidasi } from "../fondasi/eror.js";

export interface InfoValidasiKeamanan {
  valid: boolean;
  alasan?: string;
}

export function validasiInputTelegram(input: string | undefined, maxPanjang = 500): InfoValidasiKeamanan {
  if (input === undefined || input === null) {
    return { valid: true };
  }

  if (input.length > maxPanjang) {
    return { valid: false, alasan: `input terlalu panjang (maks ${maxPanjang} karakter)` };
  }

  return { valid: true };
}

export function validasiAdminToken(token: string | undefined, expected: string | undefined): InfoValidasiKeamanan {
  if (!expected) {
    return { valid: false, alasan: "ADMIN_SECRET_TOKEN belum dikonfigurasi" };
  }

  if (!token || token !== expected) {
    return { valid: false, alasan: "token admin tidak valid" };
  }

  return { valid: true };
}

export function validasiWebhookSecret(secret: string | undefined, expected: string | undefined): InfoValidasiKeamanan {
  if (!expected) {
    return { valid: false, alasan: "TELEGRAM_SECRET belum dikonfigurasi" };
  }

  if (!secret || secret !== expected) {
    return { valid: false, alasan: "secret webhook tidak valid" };
  }

  return { valid: true };
}

export function amanUntukMutasiGame(userId: string | undefined, groupId: string | undefined, isAllowed: boolean): void {
  if (!userId || !groupId) {
    throw new KesalahanValidasi("context user/group tidak valid");
  }

  if (!isAllowed) {
    throw new KesalahanAutorisasi("pemain tidak berhak melakukan mutasi game");
  }
}
