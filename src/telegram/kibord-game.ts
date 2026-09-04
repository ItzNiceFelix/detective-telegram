import type { KibordInlineTelegram } from "../infrastructure/adapters/telegram/telegram.js";
import { buatDataCallback } from "./kontrak-callback.js";
import type { CaseBible } from "../kasus/case-bible.js";
import type { SesiKasus } from "../domain/entities.js";

/**
 * Builder keyboard inline game — UI layer murni (tanpa mutasi, tanpa I/O).
 * Semua tombol memakai kontrak `v1:<aksi>[:args]`; actor selalu dari `from`.
 */

export function kibordHudUtama(): KibordInlineTelegram {
  return [
    [{ teks: "🔎 Investigate", data: buatDataCallback("hud", "investigate") }, { teks: "👥 Suspects", data: buatDataCallback("suspects") }],
    [{ teks: "🧪 Evidence", data: buatDataCallback("hud", "evidence") }, { teks: "🕰 Timeline", data: buatDataCallback("timeline") }],
    [{ teks: "🧩 Contradictions", data: buatDataCallback("contradictions") }, { teks: "💭 Theory", data: buatDataCallback("hud", "theory") }],
    [{ teks: "⚖️ Accuse", data: buatDataCallback("hud", "accuse") }],
  ];
}

export function kibordLobby(pemain: number, maks: number): KibordInlineTelegram {
  return [
    [{ teks: `🕵️ Join Investigation (${pemain}/${maks})`, data: buatDataCallback("join") }],
  ];
}

export function kibordDaftarAdegan(caseBible: CaseBible): KibordInlineTelegram {
  const baris = caseBible.scenes.map((s) => [{ teks: `🚪 ${s.name}`, data: buatDataCallback("investigate", s.sceneId) }]);
  baris.push([{ teks: "← Main Board", data: buatDataCallback("hud") }]);
  return baris;
}

export function kibordDaftarObjek(objects: Array<{ objectId: string; name: string }>): KibordInlineTelegram {
  const baris = objects.map((o) => [{ teks: `🔍 ${o.name}`, data: buatDataCallback("inspect", o.objectId) }]);
  baris.push([{ teks: "← Main Board", data: buatDataCallback("hud") }]);
  return baris;
}

export function kibordDaftarTersangka(caseBible: CaseBible): KibordInlineTelegram {
  const baris = caseBible.suspects.map((s) => [{ teks: `👤 ${s.name}`, data: buatDataCallback("suspect", s.suspectId) }]);
  baris.push([{ teks: "← Main Board", data: buatDataCallback("hud") }]);
  return baris;
}

export function kibordDetailTersangka(suspectId: string): KibordInlineTelegram {
  return [
    [{ teks: "💬 Interrogate", data: buatDataCallback("interrogate", suspectId) }, { teks: "⚡ Confront", data: buatDataCallback("confront", suspectId) }],
    [{ teks: "← Suspects", data: buatDataCallback("suspects") }, { teks: "← Main Board", data: buatDataCallback("hud") }],
  ];
}

export const MAKSUD_INTEROGASI: ReadonlyArray<{ maksud: string; label: string }> = [
  { maksud: "ASK_ALIBI", label: "🕰 Alibi" },
  { maksud: "ASK_VICTIM", label: "👤 Korban" },
  { maksud: "ASK_MOTIVE", label: "🎯 Motif" },
  { maksud: "ASK_TIMELINE", label: "🕰 Timeline" },
  { maksud: "ASK_RELATIONSHIP", label: "🤝 Relasi" },
  { maksud: "ASK_EVIDENCE", label: "🧪 Bukti" },
];

export function kibordMaksudInterogasi(suspectId: string): KibordInlineTelegram {
  const baris = MAKSUD_INTEROGASI.map((m) => [{ teks: m.label, data: buatDataCallback("interrogate_maksud", suspectId, m.maksud) }]);
  baris.push([{ teks: "← Suspect", data: buatDataCallback("suspect", suspectId) }]);
  return baris;
}

export function kibordKonfrontasiBukti(suspectId: string, evidenceIds: string[]): KibordInlineTelegram {
  const baris = evidenceIds.map((e) => [{ teks: `⚡ ${e}`, data: buatDataCallback("confront_evidence", suspectId, e) }]);
  baris.push([{ teks: "← Suspect", data: buatDataCallback("suspect", suspectId) }]);
  return baris;
}

export function kibordDaftarBukti(discoveredEvidenceIds: string[]): KibordInlineTelegram {
  const baris = discoveredEvidenceIds.map((e) => [{ teks: `🧪 ${e}`, data: buatDataCallback("hud", "evidence_detail") }]);
  baris.push([{ teks: "← Main Board", data: buatDataCallback("hud") }]);
  return baris;
}

export function kibordVote(proposalAda: boolean): KibordInlineTelegram {
  if (!proposalAda) {
    return [[{ teks: "← Main Board", data: buatDataCallback("hud") }]];
  }
  return [
    [{ teks: "🟢 YES", data: buatDataCallback("vote") }, { teks: "🔴 NO", data: buatDataCallback("vote") }],
    [{ teks: "← Main Board", data: buatDataCallback("hud") }],
  ];
}

export function kibordKonfirmasiFinalisasi(): KibordInlineTelegram {
  return [
    [{ teks: "⚖️ FINALIZE ACCUSATION", data: buatDataCallback("confirm_finalize") }],
    [{ teks: "← Review", data: buatDataCallback("hud", "accuse") }],
  ];
}

export function teksHud(sesi: SesiKasus, caseBible: CaseBible): string {
  const baris = [
    `🕵️ CASE ${String(sesi.caseId)}`,
    caseBible.title,
    ``,
    `Investigation: ${sesi.status}`,
    ``,
    `Evidence: ${sesi.discoveredEvidenceIds.length}`,
    `Suspects: ${caseBible.suspects.length}`,
    `Contradictions: ${sesi.discoveredContradictionIds.length}`,
    `Timeline: ${sesi.knownTimelineEventIds.length} events`,
    ``,
    `Detectives: ${sesi.playerIds.length}/6`,
  ];
  return baris.join("\n");
}
