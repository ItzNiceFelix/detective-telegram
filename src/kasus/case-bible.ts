import type { IdKasus } from "../fondasi/primitif.js";

export type ModeDiscovery = "AUTO" | "CONDITIONAL" | "HIDDEN";

export interface SyaratDiscovery {
  evidenceDiscovered: string;
}

export interface ObjekDapatDiperiksa {
  objectId: string;
  sceneId: string;
  name: string;
  modeDiscovery: ModeDiscovery;
  prasyarat?: SyaratDiscovery[] | undefined;
  evidenceId?: string | undefined;
}

export interface Observasi {
  observationId: string;
  objectId: string;
  text: string;
}

export interface Bukti {
  evidenceId: string;
  objectId: string;
  truthStatus: "TRUE" | "FALSE" | "PARTIAL" | "AMBIGUOUS";
  relevance: "DIRECT" | "SUPPORTING" | "CONTEXTUAL" | "RED_HERRING" | "IRRELEVANT";
}

export interface Adegan {
  sceneId: string;
  name: string;
}

// ============ SUSPECT ============

export interface Tersangka {
  suspectId: string;
  name: string;
  relationship: string;
  occupation: string;
  publicProfile: string;
}

// ============ STATEMENT / CLAIM ============

/**
 * Claim adalah proposisi yang diklaim benar oleh suspect melalui statement.
 * Claim BUKAN canonical timeline event — hanya representasi dari apa yang
 * dikatakan, yang bisa benar atau salah menurut canonical timeline.
 */
export interface Klaim {
  subject: string;
  predicate: string;
  value: string;
}

export interface Pernyataan {
  statementId: string;
  suspectId: string;
  text: string;
  claim: Klaim;
}

// ============ PRASYARAT DIALOG (prerequisite rule, minimal) ============

export type PrasyaratDialog =
  | { jenis: "EVIDENCE_DISCOVERED"; evidenceId?: string | undefined }
  | { jenis: "STATEMENT_UNLOCKED"; statementId?: string | undefined }
  | { jenis: "DIALOGUE_NODE_UNLOCKED"; nodeId?: string | undefined }
  | { jenis: "CONTRADICTION_DISCOVERED"; contradictionId?: string | undefined };

export interface SemanticResponse {
  text: string;
}

export type MaksudInterogasi =
  | "ASK_ALIBI"
  | "ASK_VICTIM"
  | "ASK_MOTIVE"
  | "ASK_TIMELINE"
  | "ASK_RELATIONSHIP"
  | "ASK_EVIDENCE"
  | "CONFRONT_EVIDENCE";

export interface NodeDialog {
  nodeId: string;
  suspectId: string;
  intents: MaksudInterogasi[];
  prasyarat: PrasyaratDialog[];
  semanticResponse: SemanticResponse;
  unlocksStatementId?: string | undefined;
  unlocksNodeIds?: string[] | undefined;
}

// ============ TIMELINE ============

export type PresisiWaktu = "EXACT" | "APPROXIMATE" | "RANGE" | "UNKNOWN";

export interface PeristiwaLinimasa {
  eventId: string;
  timestamp: {
    precision: PresisiWaktu;
    start?: string | undefined;
    end?: string | undefined;
  };
  locationId?: string | undefined;
  actorIds: string[];
  action: string;
  truthStatus: "TRUE" | "FALSE" | "PARTIAL" | "UNKNOWN";
  relatedEvidenceIds: string[];
  relatedStatementIds: string[];
}

// ============ CAUSALITY ============

export type JenisRelasiKausal = "CAUSES" | "REQUIRES" | "ENABLES" | "PREVENTS" | "FOLLOWS" | "CONTRADICTS";

export interface RelasiKausal {
  dari: string;
  ke: string;
  jenis: JenisRelasiKausal;
}

// ============ PROOF GRAPH ============

export type JenisNodeBukti = "EVIDENCE" | "EVENT" | "INFERENCE" | "STATEMENT" | "SOLUTION_FACT";

export interface NodeBukti {
  nodeId: string;
  kind: JenisNodeBukti;
}

export type RelasiEdgeBukti = "SUPPORTS" | "CONTRADICTS" | "ESTABLISHES" | "REQUIRES" | "COMBINES_WITH";

export interface EdgeBukti {
  dari: string;
  ke: string;
  relasi: RelasiEdgeBukti;
  wajib: boolean;
}

// ============ CONTRADICTION (definition — template, bukan instance) ============

export type Severitas = "MINOR" | "SIGNIFICANT" | "CRITICAL";

/**
 * Definisi kontradiksi bersifat immutable, milik CaseVersion. Kontradiksi
 * TIDAK dideteksi secara algoritmik saat runtime — hanya dimaterialisasikan
 * (disalin ID-nya ke SesiKasus) ketika confrontation yang sesuai berhasil.
 */
export interface DefinisiKontradiksi {
  contradictionId: string;
  statementId: string;
  evidenceId: string;
  severity: Severitas;
  relatedSuspectId: string;
  unlocksNodeId?: string | undefined;
  revealsTimelineEventId?: string | undefined;
}

/**
 * Subset dari Case Bible schema yang dibutuhkan untuk investigation, evidence,
 * suspect, interrogation, timeline, dan proof graph. Solution/Theory/Accusation
 * TIDAK dimodelkan — di luar scope.
 */
export interface CaseBible {
  caseBibleRef: string;
  caseId: IdKasus;
  title: string;
  victim: string;
  culpritSuspectId: string;
  scenes: Adegan[];
  objects: ObjekDapatDiperiksa[];
  observations: Observasi[];
  evidence: Bukti[];
  suspects: Tersangka[];
  statements: Pernyataan[];
  dialogueNodes: NodeDialog[];
  timelineEvents: PeristiwaLinimasa[];
  causalRelations: RelasiKausal[];
  proofNodes: NodeBukti[];
  proofEdges: EdgeBukti[];
  contradictionDefinitions: DefinisiKontradiksi[];
  motiveId: string;
  methodId: string;
}

// ============ LOOKUP HELPERS ============

export function cariAdegan(caseBible: CaseBible, sceneId: string): Adegan | null {
  return caseBible.scenes.find((adegan) => adegan.sceneId === sceneId) ?? null;
}

export function cariObjek(caseBible: CaseBible, objectId: string): ObjekDapatDiperiksa | null {
  return caseBible.objects.find((objek) => objek.objectId === objectId) ?? null;
}

export function cariObservasi(caseBible: CaseBible, objectId: string): Observasi | null {
  return caseBible.observations.find((observasi) => observasi.objectId === objectId) ?? null;
}

export function cariBukti(caseBible: CaseBible, evidenceId: string): Bukti | null {
  return caseBible.evidence.find((bukti) => bukti.evidenceId === evidenceId) ?? null;
}

export function ambilObjekPadaAdegan(caseBible: CaseBible, sceneId: string): ObjekDapatDiperiksa[] {
  return caseBible.objects.filter((objek) => objek.sceneId === sceneId);
}

export function cariTersangka(caseBible: CaseBible, suspectId: string): Tersangka | null {
  return caseBible.suspects.find((tersangka) => tersangka.suspectId === suspectId) ?? null;
}

export function cariPernyataan(caseBible: CaseBible, statementId: string): Pernyataan | null {
  return caseBible.statements.find((pernyataan) => pernyataan.statementId === statementId) ?? null;
}

export function cariNodeDialog(caseBible: CaseBible, nodeId: string): NodeDialog | null {
  return caseBible.dialogueNodes.find((node) => node.nodeId === nodeId) ?? null;
}

export function ambilNodeDialogUntukTersangka(caseBible: CaseBible, suspectId: string): NodeDialog[] {
  return caseBible.dialogueNodes.filter((node) => node.suspectId === suspectId);
}

export function cariPeristiwaLinimasa(caseBible: CaseBible, eventId: string): PeristiwaLinimasa | null {
  return caseBible.timelineEvents.find((peristiwa) => peristiwa.eventId === eventId) ?? null;
}

export function cariDefinisiKontradiksi(caseBible: CaseBible, contradictionId: string): DefinisiKontradiksi | null {
  return caseBible.contradictionDefinitions.find((def) => def.contradictionId === contradictionId) ?? null;
}

/**
 * Mencari definisi kontradiksi yang cocok dengan evidence tertentu DAN
 * statement yang sudah unlocked. Ini adalah satu-satunya cara kontradiksi
 * "ditemukan" — bukan melalui inferensi runtime.
 */
export function cariDefinisiKontradiksiUntukKonfrontasi(
  caseBible: CaseBible,
  evidenceId: string,
  statementIdsUnlocked: string[],
): DefinisiKontradiksi | null {
  return (
    caseBible.contradictionDefinitions.find(
      (def) => def.evidenceId === evidenceId && statementIdsUnlocked.includes(def.statementId),
    ) ?? null
  );
}

export function cariNodeBukti(caseBible: CaseBible, nodeId: string): NodeBukti | null {
  return caseBible.proofNodes.find((node) => node.nodeId === nodeId) ?? null;
}

export function ambilEdgeMenujuNode(caseBible: CaseBible, nodeId: string): EdgeBukti[] {
  return caseBible.proofEdges.filter((edge) => edge.ke === nodeId);
}