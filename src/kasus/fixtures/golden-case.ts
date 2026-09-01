import { buatIdKasus } from "../../fondasi/primitif.js";
import type { CaseBible } from "../case-bible.js";

/**
 * Golden Case fixture — dibuat manual, TIDAK menggunakan AI, sesuai instruksi.
 * Fixture ini permanen untuk integration/E2E testing.
 */
export const GOLDEN_CASE_BIBLE_REF = "case-bible:case-001:golden";

export const goldenCaseBible: CaseBible = {
  caseBibleRef: GOLDEN_CASE_BIBLE_REF,
  caseId: buatIdKasus("CASE-001"),
  title: "The Blackwood Room",
  victim: "Jonathan Reed",
  culpritSuspectId: "S01",
  motiveId: "MOTIVE_INSURANCE_FRAUD",
  methodId: "METHOD_POISON",
  scenes: [{ sceneId: "ROOM_407", name: "Room 407" }],
  objects: [
    {
      objectId: "OBJ_WATCH",
      sceneId: "ROOM_407",
      name: "Broken Watch",
      modeDiscovery: "AUTO",
      evidenceId: "E01",
    },
    {
      objectId: "OBJ_FOOTPRINTS",
      sceneId: "ROOM_407",
      name: "Wet Footprints",
      modeDiscovery: "AUTO",
      evidenceId: "E02",
    },
    {
      objectId: "OBJ_WINDOW",
      sceneId: "ROOM_407",
      name: "Open Window",
      modeDiscovery: "AUTO",
      evidenceId: "E03",
    },
    {
      objectId: "OBJ_CCTV",
      sceneId: "ROOM_407",
      name: "CCTV Footage",
      modeDiscovery: "AUTO",
      evidenceId: "E04",
    },
    {
      objectId: "OBJ_WINEGLASS",
      sceneId: "ROOM_407",
      name: "Wine Glass",
      modeDiscovery: "CONDITIONAL",
      prasyarat: [{ evidenceDiscovered: "E03" }],
    },
    {
      objectId: "OBJ_DESK",
      sceneId: "ROOM_407",
      name: "Desk",
      modeDiscovery: "AUTO",
    },
  ],
  observations: [
    { observationId: "OBS_WATCH", objectId: "OBJ_WATCH", text: "Jam tangan pecah, jarum berhenti di angka tertentu." },
    { observationId: "OBS_FOOTPRINTS", objectId: "OBJ_FOOTPRINTS", text: "Jejak kaki basah menuju jendela." },
    { observationId: "OBS_WINDOW", objectId: "OBJ_WINDOW", text: "Jendela terbuka, angin masuk ke ruangan." },
    { observationId: "OBS_WINEGLASS", objectId: "OBJ_WINEGLASS", text: "Gelas anggur berdiri di meja, belum disentuh." },
    { observationId: "OBS_DESK", objectId: "OBJ_DESK", text: "Meja kerja tersusun rapi, tidak ada tanda kejanggalan." },
    { observationId: "OBS_CCTV", objectId: "OBJ_CCTV", text: "Hotel CCTV timestamp shows Marcus Bell entering at 23:10." },
  ],
  evidence: [
    { evidenceId: "E01", objectId: "OBJ_WATCH", truthStatus: "TRUE", relevance: "DIRECT" },
    { evidenceId: "E02", objectId: "OBJ_FOOTPRINTS", truthStatus: "TRUE", relevance: "DIRECT" },
    { evidenceId: "E03", objectId: "OBJ_WINDOW", truthStatus: "TRUE", relevance: "SUPPORTING" },
    { evidenceId: "E04", objectId: "OBJ_CCTV", truthStatus: "TRUE", relevance: "DIRECT" },
  ],
  suspects: [
    {
      suspectId: "S01",
      name: "Marcus Bell",
      relationship: "Business partner of Jonathan Reed",
      occupation: "Investor",
      publicProfile: "Marcus Bell, business partner of the victim.",
    },
  ],
  statements: [
    {
      statementId: "ST01",
      suspectId: "S01",
      text: "I left at 22:30.",
      claim: { subject: "Marcus", predicate: "was not present after", value: "22:30" },
    },
    {
      statementId: "ST02",
      suspectId: "S01",
      text: "Alright... I came back. I was here at 23:10.",
      claim: { subject: "Marcus", predicate: "was present at", value: "23:10" },
    },
  ],
  dialogueNodes: [
    {
      nodeId: "NODE_ALIBI_01",
      suspectId: "S01",
      intents: ["ASK_ALIBI", "ASK_TIMELINE"],
      prasyarat: [],
      semanticResponse: { text: "I left at 22:30." },
      unlocksStatementId: "ST01",
    },
    {
      nodeId: "NODE_CONFRONT_E04",
      suspectId: "S01",
      intents: ["CONFRONT_EVIDENCE"],
      prasyarat: [{ jenis: "STATEMENT_UNLOCKED", statementId: "ST01" }],
      semanticResponse: { text: "Alright... I came back. I was here at 23:10." },
      unlocksStatementId: "ST02",
    },
  ],
  timelineEvents: [
    {
      eventId: "T01",
      timestamp: { precision: "EXACT", start: "22:30" },
      locationId: "ROOM_407",
      actorIds: ["S01"],
      action: "Marcus claims he leaves.",
      truthStatus: "PARTIAL",
      relatedEvidenceIds: [],
      relatedStatementIds: ["ST01"],
    },
    {
      eventId: "T02",
      timestamp: { precision: "EXACT", start: "23:10" },
      locationId: "ROOM_407",
      actorIds: ["S01"],
      action: "Marcus is actually at the hotel.",
      truthStatus: "TRUE",
      relatedEvidenceIds: ["E04"],
      relatedStatementIds: ["ST02"],
    },
  ],
  causalRelations: [
    { dari: "T01", ke: "T02", jenis: "FOLLOWS" },
    { dari: "E04", ke: "ST01", jenis: "CONTRADICTS" },
  ],
  proofNodes: [
    { nodeId: "E04", kind: "EVIDENCE" },
    { nodeId: "T02", kind: "EVENT" },
    { nodeId: "ST02", kind: "STATEMENT" },
    { nodeId: "PROOF_MARCUS_PRESENT", kind: "INFERENCE" },
    { nodeId: "SOLUTION_MARCUS_GUILTY", kind: "SOLUTION_FACT" },
  ],
  proofEdges: [
    { dari: "E04", ke: "PROOF_MARCUS_PRESENT", relasi: "SUPPORTS", wajib: true },
    { dari: "T02", ke: "PROOF_MARCUS_PRESENT", relasi: "SUPPORTS", wajib: true },
    { dari: "ST02", ke: "PROOF_MARCUS_PRESENT", relasi: "SUPPORTS", wajib: false },
    { dari: "PROOF_MARCUS_PRESENT", ke: "SOLUTION_MARCUS_GUILTY", relasi: "ESTABLISHES", wajib: true },
  ],
  contradictionDefinitions: [
    {
      contradictionId: "CONTRA_01",
      statementId: "ST01",
      evidenceId: "E04",
      severity: "CRITICAL",
      relatedSuspectId: "S01",
      unlocksNodeId: "NODE_CONFRONT_E04",
      revealsTimelineEventId: "T02",
    },
  ],
}