import type { SesiKasus } from "../entities.js";

export const BOBOT_SKOR = {
  EVIDENCE_DISCOVERY: 50,
  CONTRADICTION_FOUND: 75,
  CONFRONTATION_SUCCESS: 100,
  THEORY_CONTRIBUTION: 100,
  CORRECT_FINAL_RESOLUTION: 500,
  FULL_CLEAR_BONUS: 250,
} as const;

export interface KontribusiPemain {
  playerId: string;
  type: keyof typeof BOBOT_SKOR;
  sourceEventId: string; // idempotency key
  points: number;
}

/**
 * Hitung skor kasus dari daftar kontribusi yang SUDAH di-dedupe oleh
 * pemanggil (unique sourceEventId per type) — fungsi ini murni sum + bonus.
 */
export function hitungSkorKasus(kontribusi: KontribusiPemain[], correctResolution: boolean): number {
  const dedup = new Map<string, KontribusiPemain>();
  for (const k of kontribusi) {
    dedup.set(`${k.type}:${k.sourceEventId}`, k);
  }

  let total = 0;
  for (const k of dedup.values()) {
    total += k.points;
  }

  if (correctResolution) {
    total += BOBOT_SKOR.CORRECT_FINAL_RESOLUTION + BOBOT_SKOR.FULL_CLEAR_BONUS;
  }

  return total;
}

export function hitungKontribusiPemain(kontribusi: KontribusiPemain[], playerId: string): number {
  return kontribusi
    .filter((k) => k.playerId === playerId)
    .reduce((sum, k) => sum + k.points, 0);
}