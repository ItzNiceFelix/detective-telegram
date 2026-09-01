import type { SesiKasus } from "../entities.js";
import type { IdPemain, WaktuIso } from "../../fondasi/primitif.js";
import { StatusSesi } from "../enums.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";
import type { CaseBible, MaksudInterogasi, NodeDialog, PrasyaratDialog } from "../../kasus/case-bible.js";
import { ambilNodeDialogUntukTersangka, cariTersangka } from "../../kasus/case-bible.js";
import type { PintuRendererNaratif } from "./renderer-naratif.js";

const KATA_KUNCI_MAKSUD: Record<MaksudInterogasi, string[]> = {
  ASK_ALIBI: ["alibi", "dimana", "where were you"],
  ASK_VICTIM: ["korban", "victim", "jonathan"],
  ASK_MOTIVE: ["motif", "motive", "kenapa", "why"],
  ASK_TIMELINE: ["waktu", "jam", "timeline", "kapan", "when"],
  ASK_RELATIONSHIP: ["hubungan", "relationship", "kenal"],
  ASK_EVIDENCE: ["bukti", "evidence"],
  CONFRONT_EVIDENCE: ["konfrontasi", "confront"],
};

/**
 * Normalisasi input bebas menjadi MaksudInterogasi. Deterministic
 * keyword-matching — TIDAK menggunakan LLM. Jika tidak ada yang cocok,
 * melempar KesalahanValidasi (bukan menebak).
 */
export function normalisasiMaksud(inputBebas: string): MaksudInterogasi {
  const teks = inputBebas.trim().toLowerCase();

  for (const [maksud, kataKunci] of Object.entries(KATA_KUNCI_MAKSUD) as Array<[MaksudInterogasi, string[]]>) {
    if (kataKunci.some((kata) => teks.includes(kata))) {
      return maksud;
    }
  }

  throw new KesalahanValidasi(`Maksud interogasi tidak dikenali dari input: "${inputBebas}".`);
}

function evaluasiSatuPrasyarat(sesi: SesiKasus, syarat: PrasyaratDialog): boolean {
  switch (syarat.jenis) {
    case "EVIDENCE_DISCOVERED":
      return typeof syarat.evidenceId === "string" && sesi.discoveredEvidenceIds.includes(syarat.evidenceId);
    case "STATEMENT_UNLOCKED":
      return typeof syarat.statementId === "string" && sesi.unlockedStatementIds.includes(syarat.statementId);
    case "DIALOGUE_NODE_UNLOCKED":
      return typeof syarat.nodeId === "string" && sesi.unlockedDialogueIds.includes(syarat.nodeId);
    case "CONTRADICTION_DISCOVERED":
      return typeof syarat.contradictionId === "string" && sesi.discoveredContradictionIds.includes(syarat.contradictionId);
    default:
      return false;
  }
}

export function evaluasiPrasyaratDialog(sesi: SesiKasus, node: NodeDialog): boolean {
  return node.prasyarat.every((syarat) => evaluasiSatuPrasyarat(sesi, syarat));
}

/**
 * Mencari node dialog pertama untuk suspect+intent yang prasyaratnya
 * terpenuhi. Jika ada beberapa node valid, mengambil yang pertama ditemukan
 * pada urutan Case Bible — urutan authoring menentukan prioritas, bukan AI.
 */
function cariNodeDialogValid(caseBible: CaseBible, sesi: SesiKasus, suspectId: string, maksud: MaksudInterogasi): NodeDialog | null {
  const kandidat = ambilNodeDialogUntukTersangka(caseBible, suspectId).filter((node) => node.intents.includes(maksud));

  return kandidat.find((node) => evaluasiPrasyaratDialog(sesi, node)) ?? null;
}

export interface HasilInterogasi {
  sesi: SesiKasus;
  node: NodeDialog;
  responseText: string;
  statementBaruDiunlock: boolean;
  nodeBaruDiunlock: boolean;
  sudahDiunlockSebelumnya: boolean;
}

/**
 * Interogasi tersangka dengan maksud tertentu. Fungsi murni — pemanggil
 * bertanggung jawab atas transaksi Firestore.
 *
 * Idempotent: mengulang node yang sama tidak menghasilkan unlock/reward
 * tambahan — mengembalikan sesi TIDAK BERUBAH (referensi sama) jika node
 * sudah unlocked sebelumnya.
 */
export function interogasiTersangka(
  sesi: SesiKasus,
  caseBible: CaseBible,
  renderer: PintuRendererNaratif,
  suspectId: string,
  maksud: MaksudInterogasi,
  _pemain: IdPemain,
  waktuSekarang: WaktuIso,
): HasilInterogasi {
  validasiSesiTerbuka(sesi);

  const tersangka = cariTersangka(caseBible, suspectId);
  if (!tersangka) {
    throw new KesalahanValidasi(`Tersangka tidak ditemukan: ${suspectId}.`);
  }

  const node = cariNodeDialogValid(caseBible, sesi, suspectId, maksud);
  if (!node) {
    throw new KesalahanValidasi(`Tidak ada node dialog valid untuk maksud "${maksud}" pada tersangka ini saat ini.`);
  }

  const responseText = renderer.renderRespon(node.semanticResponse);
  const sudahDiunlockSebelumnya = sesi.unlockedDialogueIds.includes(node.nodeId);

  if (sudahDiunlockSebelumnya) {
    return {
      sesi,
      node,
      responseText,
      statementBaruDiunlock: false,
      nodeBaruDiunlock: false,
      sudahDiunlockSebelumnya: true,
    };
  }

  const unlockedDialogueIdsBaru = [...sesi.unlockedDialogueIds, node.nodeId];
  const kandidatStatementBaru = node.unlocksStatementId;
  const statementBaruDiunlock = Boolean(kandidatStatementBaru) && !sesi.unlockedStatementIds.includes(kandidatStatementBaru!);
  const unlockedStatementIdsBaru = statementBaruDiunlock && kandidatStatementBaru
    ? [...sesi.unlockedStatementIds, kandidatStatementBaru]
    : sesi.unlockedStatementIds;

  return {
    sesi: {
      ...sesi,
      unlockedDialogueIds: unlockedDialogueIdsBaru,
      ...(statementBaruDiunlock && kandidatStatementBaru ? { unlockedStatementIds: unlockedStatementIdsBaru } : {}),
      lastActivityAt: waktuSekarang,
      updatedAt: waktuSekarang,
    },
    node,
    responseText,
    statementBaruDiunlock,
    nodeBaruDiunlock: true,
    sudahDiunlockSebelumnya: false,
  };
}

function validasiSesiTerbuka(sesi: SesiKasus): void {
  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanValidasi("Interogasi hanya valid ketika sesi berstatus OPEN.");
  }
}