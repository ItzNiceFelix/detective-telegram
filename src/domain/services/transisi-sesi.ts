import { StatusSesi } from "../enums.js";
import type { SesiKasus } from "../entities.js";
import type { IdPemain, WaktuIso } from "../../fondasi/primitif.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";

const MAKS_DETEKTIF_AKTIF = 6;

/**
 * Graf transisi legal untuk StatusSesi. Sesuai docs/03-gameplay.md §3.2.3 dan
 * docs/26-coding-baseline.md §26.3. CLEARED adalah terminal kecuali menuju ARCHIVED.
 */
const TRANSISI_LEGAL: Record<StatusSesi, StatusSesi[]> = {
  [StatusSesi.LOBBY]: [StatusSesi.OPEN, StatusSesi.ARCHIVED],
  [StatusSesi.OPEN]: [StatusSesi.PAUSED, StatusSesi.CLEARED],
  [StatusSesi.PAUSED]: [StatusSesi.OPEN, StatusSesi.ARCHIVED],
  [StatusSesi.CLEARED]: [StatusSesi.ARCHIVED],
  [StatusSesi.ARCHIVED]: [],
};

/**
 * Validasi murni: apakah transisi dari `dari` ke `ke` legal menurut state machine sesi.
 * Tidak melakukan side effect, tidak membaca waktu sistem.
 */
export function validasiTransisiSesi(dari: StatusSesi, ke: StatusSesi): void {
  const tujuanDiperbolehkan = TRANSISI_LEGAL[dari] ?? [];

  if (!tujuanDiperbolehkan.includes(ke)) {
    throw new KesalahanValidasi(
      `Transisi status sesi tidak valid: ${dari} -> ${ke}.`,
    );
  }
}

/**
 * Memulai sesi dari LOBBY ke OPEN. Mengembalikan sesi baru (tidak memutasi input),
 * pemanggil bertanggung jawab menyimpan hasil melalui repository dalam transaction.
 */
export function mulaiSesi(sesi: SesiKasus, waktuSekarang: WaktuIso): SesiKasus {
  validasiTransisiSesi(sesi.status, StatusSesi.OPEN);

  return {
    ...sesi,
    status: StatusSesi.OPEN,
    startedAt: sesi.startedAt ?? waktuSekarang,
    lastActivityAt: waktuSekarang,
    updatedAt: waktuSekarang,
  };
}

/**
 * Menjeda sesi OPEN menjadi PAUSED. PAUSED tidak terpengaruh oleh derived
 * inactivity/cold status (lihat hitungStatusEfektif).
 */
export function jedaSesi(sesi: SesiKasus, waktuSekarang: WaktuIso): SesiKasus {
  validasiTransisiSesi(sesi.status, StatusSesi.PAUSED);

  return {
    ...sesi,
    status: StatusSesi.PAUSED,
    updatedAt: waktuSekarang,
  };
}

/**
 * Melanjutkan sesi PAUSED kembali ke OPEN. lastActivityAt di-refresh agar
 * inactivity/cold clock mulai dihitung ulang dari titik resume.
 */
export function lanjutkanSesi(sesi: SesiKasus, waktuSekarang: WaktuIso): SesiKasus {
  validasiTransisiSesi(sesi.status, StatusSesi.OPEN);

  return {
    ...sesi,
    status: StatusSesi.OPEN,
    lastActivityAt: waktuSekarang,
    updatedAt: waktuSekarang,
  };
}

/**
 * Mengarsipkan sesi dari LOBBY, PAUSED, atau CLEARED. ARCHIVED bersifat terminal.
 */
export function arsipkanSesi(sesi: SesiKasus, waktuSekarang: WaktuIso): SesiKasus {
  validasiTransisiSesi(sesi.status, StatusSesi.ARCHIVED);

  return {
    ...sesi,
    status: StatusSesi.ARCHIVED,
    updatedAt: waktuSekarang,
  };
}

/**
 * Menambahkan detective baru ke sesi. Menegakkan batas maksimum 6 detective aktif
 * (docs/26-coding-baseline.md §26.1, docs/16-player-group-scoring.md §16.1) dan
 * mencegah duplikasi player yang sudah terdaftar.
 *
 * Tidak melakukan pengecekan role/spectator — itu domain LayananAkses, di luar
 * scope Milestone 3.
 */
export function tambahDetektifKeSesi(sesi: SesiKasus, userId: IdPemain, waktuSekarang: WaktuIso): SesiKasus {
  if (sesi.playerIds.includes(userId)) {
    return sesi;
  }

  if (sesi.playerIds.length >= MAKS_DETEKTIF_AKTIF) {
    throw new KesalahanValidasi(
      `Sesi sudah mencapai batas maksimum ${MAKS_DETEKTIF_AKTIF} detective aktif.`,
    );
  }

  return {
    ...sesi,
    playerIds: [...sesi.playerIds, userId],
    updatedAt: waktuSekarang,
  };
}

export const BATAS_DETEKTIF_AKTIF = MAKS_DETEKTIF_AKTIF;