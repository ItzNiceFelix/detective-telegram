/**
 * Kontrak callback inline keyboard — UI layer murni, TANPA business logic.
 * Format kompak berversi: `v1:<aksi>[:<arg1>[:<arg2>]]`.
 * - Actor TIDAK PERNAH dari data — selalu Telegram `from.id` (adapter).
 * - Aksi/target adalah input tak terpercaya: dispatcher wajib validasi ulang
 *   sesi, actor, target, dan legalitas aksi terhadap state otoritatif.
 */
export const VERSI_CALLBACK = "v1";

export type AksiCallback =
  | "join"
  | "hud"
  | "investigate"
  | "inspect"
  | "suspects"
  | "suspect"
  | "interrogate"
  | "interrogate_maksud"
  | "confront"
  | "confront_evidence"
  | "timeline"
  | "contradictions"
  | "theory"
  | "accuse"
  | "vote"
  | "finalize"
  | "confirm_finalize"
  | "back";

export interface CallbackTerurai {
  versi: string;
  aksi: AksiCallback;
  args: string[];
}

const AKSI_VALID: ReadonlySet<string> = new Set([
  "join", "hud", "investigate", "inspect", "suspects", "suspect",
  "interrogate", "interrogate_maksud", "confront", "confront_evidence",
  "timeline", "contradictions", "theory", "accuse", "vote",
  "finalize", "confirm_finalize", "back",
]);

/** Parse data callback mentah → struktur; null bila format tak dikenal. */
export function uraiDataCallback(data: string): CallbackTerurai | null {
  if (typeof data !== "string" || data.length === 0 || data.length > 64) return null;
  const bagian = data.split(":");
  if (bagian.length < 2) return null;
  const [versi, aksi, ...args] = bagian;
  if (versi !== VERSI_CALLBACK) return null;
  if (!aksi || !AKSI_VALID.has(aksi)) return null;
  for (const a of args) {
    if (a.length === 0 || a.length > 64 || a.includes(" ")) return null;
  }
  return { versi, aksi: aksi as AksiCallback, args };
}

/** Bangun data callback dari aksi + args (simetris dengan parser). */
export function buatDataCallback(aksi: AksiCallback, ...args: string[]): string {
  return [VERSI_CALLBACK, aksi, ...args].join(":");
}
