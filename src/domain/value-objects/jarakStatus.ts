import { StatusSesi } from "../enums.js";

export interface StatusEfektif {
  statusPersisted: StatusSesi;
  effectiveStatus: "ACTIVE" | "INACTIVE" | "COLD" | "PAUSED" | "CLEARED" | "ARCHIVED";
  lastActivityAt?: string | undefined;
}

export interface AmbangStatusEfektif {
  ambangInaktifJam: number;
  ambangDinginJam: number;
}

const AMBANG_DEFAULT: AmbangStatusEfektif = {
  ambangInaktifJam: 48,
  ambangDinginJam: 168,
};

/**
 * Menghitung effective status sesi berdasarkan status persisted dan lastActivityAt.
 * PAUSED, CLEARED, ARCHIVED selalu tetap pada status persisted-nya masing-masing —
 * derived inactivity/cold hanya berlaku untuk sesi berstatus OPEN.
 */
export function hitungStatusEfektif(
  statusPersisted: StatusSesi,
  lastActivityAt?: string,
  ambang: AmbangStatusEfektif = AMBANG_DEFAULT,
): StatusEfektif {
  if (statusPersisted === StatusSesi.PAUSED) {
    return { statusPersisted, effectiveStatus: "PAUSED", lastActivityAt };
  }

  if (statusPersisted === StatusSesi.CLEARED) {
    return { statusPersisted, effectiveStatus: "CLEARED", lastActivityAt };
  }

  if (statusPersisted === StatusSesi.ARCHIVED) {
    return { statusPersisted, effectiveStatus: "ARCHIVED", lastActivityAt };
  }

  if (statusPersisted === StatusSesi.LOBBY) {
    return { statusPersisted, effectiveStatus: "LOBBY" as StatusEfektif["effectiveStatus"], lastActivityAt };
  }

  // Hanya OPEN yang punya derived inactivity/cold status.
  if (!lastActivityAt) {
    return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
  }

  const waktuAktivitas = new Date(lastActivityAt).getTime();
  if (Number.isNaN(waktuAktivitas)) {
    // Timestamp tidak valid diperlakukan sebagai tidak ada data aktivitas — default ACTIVE
    // agar tidak salah menandai sesi sehat sebagai COLD akibat data korup.
    return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
  }

  const sekarang = Date.now();
  const elapsedJam = (sekarang - waktuAktivitas) / (1000 * 60 * 60);

  if (elapsedJam < 0) {
    // lastActivityAt di masa depan (clock skew) — perlakukan sebagai ACTIVE, jangan crash.
    return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
  }

  if (elapsedJam > ambang.ambangDinginJam) {
    return { statusPersisted, effectiveStatus: "COLD", lastActivityAt };
  }

  if (elapsedJam >= ambang.ambangInaktifJam) {
    return { statusPersisted, effectiveStatus: "INACTIVE", lastActivityAt };
  }

  return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
}