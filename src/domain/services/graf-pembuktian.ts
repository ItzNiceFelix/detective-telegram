import type { SesiKasus } from "../entities.js";
import type { CaseBible, EdgeBukti } from "../../kasus/case-bible.js";
import { ambilEdgeMenujuNode, cariNodeBukti } from "../../kasus/case-bible.js";

export type StatusDukunganBukti = "UNSUPPORTED" | "WEAK" | "PLAUSIBLE" | "STRONG" | "PROVEN";

/**
 * Mengevaluasi apakah sebuah edge (baik EVIDENCE, EVENT, maupun INFERENCE node
 * sumber) sudah "terpenuhi" berdasarkan discovered knowledge pemain saat ini.
 */
function apakahNodeSumberTerpenuhi(sesi: SesiKasus, caseBible: CaseBible, nodeId: string): boolean {
  const node = cariNodeBukti(caseBible, nodeId);
  if (!node) {
    return false;
  }

  switch (node.kind) {
    case "EVIDENCE":
      return sesi.discoveredEvidenceIds.includes(nodeId);
    case "EVENT":
      return sesi.knownTimelineEventIds.includes(nodeId);
    case "STATEMENT":
      return sesi.unlockedStatementIds.includes(nodeId);
    case "INFERENCE":
    case "SOLUTION_FACT":
      // Inference/solution fact node dianggap terpenuhi jika evaluasi
      // rekursifnya mencapai PROVEN.
      return evaluasiGrafPembuktian(sesi, caseBible, nodeId) === "PROVEN";
    default:
      return false;
  }
}

/**
 * Evaluasi deterministik status dukungan bukti untuk sebuah proof node.
 * Tidak menggunakan probabilitas/AI — murni graph walk atas edge wajib
 * (required) vs supporting (non-required).
 */
export function evaluasiGrafPembuktian(sesi: SesiKasus, caseBible: CaseBible, proofNodeId: string): StatusDukunganBukti {
  const node = cariNodeBukti(caseBible, proofNodeId);
  if (!node) {
    return "UNSUPPORTED";
  }

  const edgesMasuk: EdgeBukti[] = ambilEdgeMenujuNode(caseBible, proofNodeId);

  if (edgesMasuk.length === 0) {
    // Node tanpa dependency (leaf) — dianggap PROVEN jika node itu sendiri
    // adalah EVIDENCE/EVENT/STATEMENT yang sudah diketahui pemain.
    return apakahNodeSumberTerpenuhiLangsung(sesi, node) ? "PROVEN" : "UNSUPPORTED";
  }

  const edgesWajib = edgesMasuk.filter((edge) => edge.wajib);
  const edgesPendukung = edgesMasuk.filter((edge) => !edge.wajib);

  const wajibTerpenuhi = edgesWajib.filter((edge) => apakahNodeSumberTerpenuhi(sesi, caseBible, edge.dari));
  const pendukungTerpenuhi = edgesPendukung.filter((edge) => apakahNodeSumberTerpenuhi(sesi, caseBible, edge.dari));

  const semuaWajibTerpenuhi = edgesWajib.length > 0 && wajibTerpenuhi.length === edgesWajib.length;

  if (semuaWajibTerpenuhi) {
    // Semua required edge terpenuhi — node ini dianggap PROVEN langsung
    // (tidak ada lapisan inferensi tambahan yang dimodelkan di milestone ini).
    return "PROVEN";
  }

  if (edgesWajib.length === 0 && pendukungTerpenuhi.length > 0) {
    return "WEAK";
  }

  if (wajibTerpenuhi.length > 0) {
    return wajibTerpenuhi.length === edgesWajib.length ? "STRONG" : "PLAUSIBLE";
  }

  if (pendukungTerpenuhi.length > 0) {
    return "WEAK";
  }

  return "UNSUPPORTED";
}

function apakahNodeSumberTerpenuhiLangsung(sesi: SesiKasus, node: { nodeId: string; kind: string }): boolean {
  switch (node.kind) {
    case "EVIDENCE":
      return sesi.discoveredEvidenceIds.includes(node.nodeId);
    case "EVENT":
      return sesi.knownTimelineEventIds.includes(node.nodeId);
    case "STATEMENT":
      return sesi.unlockedStatementIds.includes(node.nodeId);
    default:
      return false;
  }
}