import { validasiRelasiKausal } from "../domain/services/linimasa.js";
import type { PintuAi, PermintaanAi, ResponAi } from "../ai/contracts.js";
import { KesalahanValidasi } from "../fondasi/eror.js";
import { buatIdKasus, buatIdVersiKasus, buatWaktuIso } from "../fondasi/primitif.js";
import type { CaseBible, DefinisiKontradiksi, EdgeBukti, JenisRelasiKausal, NodeBukti, ObjekDapatDiperiksa, Pernyataan, PeristiwaLinimasa, RelasiKausal, Tersangka } from "./case-bible.js";
import { StatusVersiKasus, buatVersiKasus } from "./versi-kasus.js";

export interface BenihKasus {
  genre: string;
  setting: string;
  difficulty: string;
  suspectCount: number;
  sceneCount: number;
  mustUseMechanics: string[];
}

export interface MetadataGenerasiKasus {
  generatorVersion: string;
  promptVersion: string;
  schemaVersion: number;
  provider: string;
  model?: string | undefined;
  generatedAt: string;
  validationSummary: string[];
}

export interface MetadataKasusGenerasi {
  title: string;
  premise: string;
  genre: string;
  starRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface KandidatKasus {
  caseId: string;
  versionId: string;
  caseBibleRef: string;
  assetManifestRef: string;
  metadata: MetadataKasusGenerasi;
  caseBible: CaseBible;
  generation: MetadataGenerasiKasus;
}

export interface OpsiGenerasiKasus {
  maxRetries?: number;
  maxOutputTokens?: number;
  generatorVersion?: string;
  promptVersion?: string;
  schemaVersion?: number;
  provider?: string;
  model?: string;
  caseBibleRef?: string;
  assetManifestRef?: string;
}

export interface HasilValidasiGerbang {
  valid: boolean;
  gagal: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bacaString(record: Record<string, unknown>, kunci: string): string | null {
  const value = record[kunci];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function bacaStringArray(record: Record<string, unknown>, kunci: string): string[] {
  const value = record[kunci];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function pilihString(value: unknown, defaultValue: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : defaultValue;
}

function normalisasiPertanyaan(request: PermintaanAi): Record<string, unknown> {
  return isRecord(request.context) ? request.context : {};
}

export function buatMetadataGenerasi(
  provider: string,
  opsi: Partial<OpsiGenerasiKasus> = {},
  validationSummary: string[] = [],
): MetadataGenerasiKasus {
  return {
    generatorVersion: opsi.generatorVersion ?? "ai-case-generator/v1",
    promptVersion: opsi.promptVersion ?? "case-generation:v1",
    schemaVersion: opsi.schemaVersion ?? 1,
    provider,
    model: opsi.model,
    generatedAt: new Date().toISOString(),
    validationSummary,
  };
}

export function buatKandidatKasus(
  benih: BenihKasus,
  penyedia: PintuAi,
  opsi: OpsiGenerasiKasus = {},
): Promise<KandidatKasus> {
  return buatKandidatKasusDenganPenyedia(benih, penyedia, opsi);
}

export async function buatKandidatKasusDenganPenyedia(
  benih: BenihKasus,
  penyedia: PintuAi,
  opsi: OpsiGenerasiKasus = {},
): Promise<KandidatKasus> {
  const maxRetries = opsi.maxRetries ?? 2;
  const providerName = opsi.provider ?? "unknown-provider";
  const generatedAt = new Date().toISOString();

  for (let percobaan = 0; percobaan <= maxRetries; percobaan += 1) {
    const request: PermintaanAi = {
      promptType: "case_generation",
      context: {
        seed: benih,
        provider: providerName,
        generatedAt,
        skemaKandidat: DESKRIPSI_SKEMA_KANDIDAT,
        contohKandidat: CONTOH_MINIMAL_KANDIDAT,
      },
      maxTokens: opsi.maxOutputTokens ?? 4000,
    };

    const hasil: ResponAi = await penyedia.generateText(request);
    const raw = hasil.output;

    try {
      const parsed = JSON.parse(raw) as unknown;
      const kandidat = normalisasiKandidatKasus(parsed, benih, opsi, providerName, hasil.warnings);
      validasiGerbangPublikasi(kandidat, { validasiSemua: true });
      return kandidat;
    } catch (error) {
      if (percobaan >= maxRetries) {
        throw error instanceof Error ? error : new KesalahanValidasi("Kandidat kasus gagal validasi setelah retry terbatas.");
      }
    }
  }

  throw new KesalahanValidasi("Kandidat kasus gagal validasi setelah retry terbatas.");
}

function normalisasiKandidatKasus(
  value: unknown,
  benih: BenihKasus,
  opsi: OpsiGenerasiKasus,
  providerName: string,
  warnings: string[],
): KandidatKasus {
  const kandidatRecord = isRecord(value) ? value : null;
  if (!kandidatRecord) {
    throw new KesalahanValidasi("AI output tidak valid JSON: body bukan object.");
  }

  const caseBibleRecord = isRecord(kandidatRecord.caseBible) ? kandidatRecord.caseBible : kandidatRecord;
  const caseBible = normalisasiCaseBible(caseBibleRecord, benih);

  const title = bacaString(kandidatRecord, "title") ?? caseBible.title ?? "Case Title";
  const premise = bacaString(kandidatRecord, "premise") ?? "Premise belum dibuat.";
  const genre = bacaString(kandidatRecord, "genre") ?? benih.genre ?? "MYSTERY";
  const caseId = chooseCaseId(kandidatRecord, caseBible.caseId) as CaseBible["caseId"];
  const versionId = chooseVersionId(kandidatRecord, String(caseId), benih);
  const generatedAt = new Date().toISOString();

  const kandidat: KandidatKasus = {
    caseId,
    versionId,
    caseBibleRef: opsi.caseBibleRef ?? `case-bible:${caseId}:${versionId}`,
    assetManifestRef: opsi.assetManifestRef ?? `assets:${caseId}:${versionId}:manifest`,
    metadata: {
      title,
      premise,
      genre,
      starRating: 4,
      tags: bacaStringArray(kandidatRecord, "tags").length > 0 ? bacaStringArray(kandidatRecord, "tags") : [benih.genre, benih.setting],
    },
    caseBible,
    generation: {
      generatorVersion: opsi.generatorVersion ?? "ai-case-generator/v1",
      promptVersion: opsi.promptVersion ?? "case-generation:v1",
      schemaVersion: opsi.schemaVersion ?? 1,
      provider: providerName,
      model: opsi.model,
      generatedAt,
      validationSummary: warnings.length > 0 ? warnings : ["candidate-generated"],
    },
  };

  validasiStrukturKasus(kandidat);
  return kandidat;
}

function chooseCaseId(record: Record<string, unknown>, fallback: string): string {
  const value = bacaString(record, "caseId");
  return value ?? fallback ?? `CASE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function chooseVersionId(record: Record<string, unknown>, caseId: string, benih: BenihKasus): string {
  const value = bacaString(record, "versionId");
  if (value) {
    return value;
  }

  return `v-${caseId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${benih.genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-1`;
}

function normalisasiCaseBible(value: Record<string, unknown>, benih: BenihKasus): CaseBible {
  const caseBible: Partial<CaseBible> = {
    caseBibleRef: pilihString(value.caseBibleRef, `case-bible:${benih.genre}:${Date.now()}`),
    caseId: pilihString(value.caseId, `CASE-${Date.now().toString(36).toUpperCase()}`) as CaseBible["caseId"],
    title: pilihString(value.title, `${benih.genre} in ${benih.setting}`),
    victim: pilihString(value.victim, "Victim"),
    culpritSuspectId: pilihString(value.culpritSuspectId, "S01"),
    scenes: Array.isArray(value.scenes) ? (value.scenes as unknown[]).map((item) => isRecord(item) ? {
      sceneId: pilihString(item.sceneId, "SCENE_01"),
      name: pilihString(item.name, "Scene 01"),
    } : { sceneId: "SCENE_01", name: "Scene 01" }) : [{ sceneId: "SCENE_01", name: "Scene 01" }],
    objects: Array.isArray(value.objects) ? (value.objects as unknown[]).map((item) => isRecord(item) ? {
      objectId: pilihString(item.objectId, "OBJ_01"),
      sceneId: pilihString(item.sceneId, "SCENE_01"),
      name: pilihString(item.name, "Object 01"),
      modeDiscovery: (typeof item.modeDiscovery === "string" ? item.modeDiscovery : "AUTO") as "AUTO" | "CONDITIONAL" | "HIDDEN",
      prasyarat: Array.isArray(item.prasyarat) ? item.prasyarat as Array<{ evidenceDiscovered: string }> : [],
      evidenceId: typeof item.evidenceId === "string" ? item.evidenceId : undefined,
    } : {
      objectId: "OBJ_01",
      sceneId: "SCENE_01",
      name: "Object 01",
      modeDiscovery: "AUTO",
      prasyarat: [],
    }) : [],
    observations: Array.isArray(value.observations) ? (value.observations as unknown[]).map((item) => isRecord(item) ? {
      observationId: pilihString(item.observationId, "OBS_01"),
      objectId: pilihString(item.objectId, "OBJ_01"),
      text: pilihString(item.text, "Observation"),
    } : { observationId: "OBS_01", objectId: "OBJ_01", text: "Observation" }) : [],
    evidence: Array.isArray(value.evidence) ? (value.evidence as unknown[]).map((item) => isRecord(item) ? {
      evidenceId: pilihString(item.evidenceId, "E01"),
      objectId: pilihString(item.objectId, "OBJ_01"),
      truthStatus: (typeof item.truthStatus === "string" ? item.truthStatus : "TRUE") as "TRUE" | "FALSE" | "PARTIAL" | "AMBIGUOUS",
      relevance: (typeof item.relevance === "string" ? item.relevance : "DIRECT") as "DIRECT" | "SUPPORTING" | "CONTEXTUAL" | "RED_HERRING" | "IRRELEVANT",
      source: (typeof item.source === "string" ? item.source : "VISUAL") as "VISUAL" | "DOCUMENT" | "DIGITAL" | "TESTIMONIAL" | "TIMELINE" | "FORENSIC" | "ENVIRONMENT",
      fact: typeof item.fact === "string" ? item.fact : undefined,
      discoveryRules: Array.isArray(item.discoveryRules) ? item.discoveryRules.filter((entry): entry is string => typeof entry === "string") : [],
      relatedSuspects: Array.isArray(item.relatedSuspects) ? item.relatedSuspects.filter((entry): entry is string => typeof entry === "string") : [],
      relatedTimelineEvents: Array.isArray(item.relatedTimelineEvents) ? item.relatedTimelineEvents.filter((entry): entry is string => typeof entry === "string") : [],
    } : {
      evidenceId: "E01",
      objectId: "OBJ_01",
      truthStatus: "TRUE",
      relevance: "DIRECT",
      source: "VISUAL",
      discoveryRules: [],
      relatedSuspects: [],
      relatedTimelineEvents: [],
    }) : [],
    suspects: Array.isArray(value.suspects) ? (value.suspects as unknown[]).map((item) => isRecord(item) ? {
      suspectId: pilihString(item.suspectId, "S01"),
      name: pilihString(item.name, "Suspect 01"),
      relationship: pilihString(item.relationship, "Related to victim"),
      occupation: pilihString(item.occupation, "Occupation"),
      publicProfile: pilihString(item.publicProfile, "Public profile"),
    } : { suspectId: "S01", name: "Suspect 01", relationship: "Related to victim", occupation: "Occupation", publicProfile: "Public profile" }) : [{ suspectId: "S01", name: "Suspect 01", relationship: "Related to victim", occupation: "Occupation", publicProfile: "Public profile" }],
    statements: Array.isArray(value.statements) ? (value.statements as unknown[]).map((item) => isRecord(item) ? {
      statementId: pilihString(item.statementId, "ST01"),
      suspectId: pilihString(item.suspectId, "S01"),
      text: pilihString(item.text, "Statement"),
      claim: isRecord(item.claim) ? {
        subject: pilihString(item.claim.subject, "Subject"),
        predicate: pilihString(item.claim.predicate, "predicate"),
        value: pilihString(item.claim.value, "value"),
      } : { subject: "Subject", predicate: "predicate", value: "value" },
    } : { statementId: "ST01", suspectId: "S01", text: "Statement", claim: { subject: "Subject", predicate: "predicate", value: "value" } }) : [],
    dialogueNodes: Array.isArray(value.dialogueNodes) ? (value.dialogueNodes as unknown[]).map((item) => isRecord(item) ? {
      nodeId: pilihString(item.nodeId, "D01"),
      suspectId: pilihString(item.suspectId, "S01"),
      intents: (Array.isArray(item.intents) ? item.intents.filter((entry): entry is string => typeof entry === "string") : []).map((entry) => entry as "ASK_ALIBI" | "ASK_VICTIM" | "ASK_MOTIVE" | "ASK_TIMELINE" | "ASK_RELATIONSHIP" | "ASK_EVIDENCE" | "CONFRONT_EVIDENCE"),
      prasyarat: Array.isArray(item.prasyarat) ? item.prasyarat.map((prasyarat) => isRecord(prasyarat) ? {
        jenis: choosePrasyaratJenis(prasyarat.jenis),
        evidenceId: typeof prasyarat.evidenceId === "string" ? prasyarat.evidenceId : undefined,
        statementId: typeof prasyarat.statementId === "string" ? prasyarat.statementId : undefined,
        nodeId: typeof prasyarat.nodeId === "string" ? prasyarat.nodeId : undefined,
        contradictionId: typeof prasyarat.contradictionId === "string" ? prasyarat.contradictionId : undefined,
      } : { jenis: "EVIDENCE_DISCOVERED", evidenceId: "E01" }) : [],
      semanticResponse: isRecord(item.semanticResponse) ? { text: pilihString(item.semanticResponse.text, "Response") } : { text: "Response" },
      unlocksStatementId: typeof item.unlocksStatementId === "string" ? item.unlocksStatementId : undefined,
      unlocksNodeIds: Array.isArray(item.unlocksNodeIds) ? item.unlocksNodeIds.filter((entry): entry is string => typeof entry === "string") : undefined,
    } : { nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "Response" } }) : [],
    timelineEvents: Array.isArray(value.timelineEvents) ? (value.timelineEvents as unknown[]).map((item) => isRecord(item) ? {
      eventId: pilihString(item.eventId, "T01"),
      timestamp: isRecord(item.timestamp) ? {
        precision: (typeof item.timestamp.precision === "string" ? item.timestamp.precision : "EXACT") as "EXACT" | "APPROXIMATE" | "RANGE" | "UNKNOWN",
        start: typeof item.timestamp.start === "string" ? item.timestamp.start : undefined,
        end: typeof item.timestamp.end === "string" ? item.timestamp.end : undefined,
      } : { precision: "EXACT", start: "00:00" },
      locationId: typeof item.locationId === "string" ? item.locationId : undefined,
      actorIds: Array.isArray(item.actorIds) ? item.actorIds.filter((entry): entry is string => typeof entry === "string") : [],
      action: pilihString(item.action, "Action"),
      truthStatus: (typeof item.truthStatus === "string" ? item.truthStatus : "TRUE") as "TRUE" | "FALSE" | "PARTIAL" | "UNKNOWN",
      relatedEvidenceIds: Array.isArray(item.relatedEvidenceIds) ? item.relatedEvidenceIds.filter((entry): entry is string => typeof entry === "string") : [],
      relatedStatementIds: Array.isArray(item.relatedStatementIds) ? item.relatedStatementIds.filter((entry): entry is string => typeof entry === "string") : [],
    } : { eventId: "T01", timestamp: { precision: "EXACT", start: "00:00" }, actorIds: ["S01"], action: "Action", truthStatus: "TRUE", relatedEvidenceIds: [], relatedStatementIds: [] }) : [],
    causalRelations: Array.isArray(value.causalRelations) ? (value.causalRelations as unknown[]).map((item) => isRecord(item) ? {
      dari: pilihString(item.dari, "E01"),
      ke: pilihString(item.ke, "E02"),
      jenis: (typeof item.jenis === "string" ? item.jenis : "CAUSES") as JenisRelasiKausal,
    } : { dari: "E01", ke: "E02", jenis: "CAUSES" }) : [],
    proofNodes: Array.isArray(value.proofNodes) ? (value.proofNodes as unknown[]).map((item) => isRecord(item) ? {
      nodeId: pilihString(item.nodeId, "N01"),
      kind: (typeof item.kind === "string" ? item.kind : "EVIDENCE") as NodeBukti["kind"],
    } : { nodeId: "N01", kind: "EVIDENCE" }) : [],
    proofEdges: Array.isArray(value.proofEdges) ? (value.proofEdges as unknown[]).map((item) => isRecord(item) ? {
      dari: pilihString(item.dari, "N01"),
      ke: pilihString(item.ke, "N02"),
      relasi: (typeof item.relasi === "string" ? item.relasi : "SUPPORTS") as EdgeBukti["relasi"],
      wajib: Boolean(item.wajib),
    } : { dari: "N01", ke: "N02", relasi: "SUPPORTS", wajib: true }) : [],
    contradictionDefinitions: Array.isArray(value.contradictionDefinitions) ? (value.contradictionDefinitions as unknown[]).map((item) => isRecord(item) ? {
      contradictionId: pilihString(item.contradictionId, "C01"),
      statementId: pilihString(item.statementId, "ST01"),
      evidenceId: pilihString(item.evidenceId, "E01"),
      severity: (typeof item.severity === "string" ? item.severity : "CRITICAL") as DefinisiKontradiksi["severity"],
      relatedSuspectId: pilihString(item.relatedSuspectId, "S01"),
      unlocksNodeId: typeof item.unlocksNodeId === "string" ? item.unlocksNodeId : undefined,
      revealsTimelineEventId: typeof item.revealsTimelineEventId === "string" ? item.revealsTimelineEventId : undefined,
    } : { contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01" }) : [],
  };

  return caseBible as CaseBible;
}

function choosePrasyaratJenis(value: unknown): "EVIDENCE_DISCOVERED" | "STATEMENT_UNLOCKED" | "DIALOGUE_NODE_UNLOCKED" | "CONTRADICTION_DISCOVERED" {
  const jenis = typeof value === "string" ? value : "EVIDENCE_DISCOVERED";
  switch (jenis) {
    case "EVIDENCE_DISCOVERED":
    case "STATEMENT_UNLOCKED":
    case "DIALOGUE_NODE_UNLOCKED":
    case "CONTRADICTION_DISCOVERED":
      return jenis;
    default:
      return "EVIDENCE_DISCOVERED";
  }
}

export function validasiStrukturKasus(kandidat: KandidatKasus): void {
  if (!kandidat.caseId || !kandidat.versionId) {
    throw new KesalahanValidasi("Kandidat kasus membutuhkan caseId dan versionId.");
  }

  const caseBible = kandidat.caseBible;
  if (!caseBible.caseId || !caseBible.caseBibleRef || !caseBible.title || !caseBible.victim) {
    throw new KesalahanValidasi("Struktur Case Bible tidak lengkap.");
  }

  if (!Array.isArray(caseBible.suspects) || caseBible.suspects.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki setidaknya satu tersangka.");
  }

  if (!Array.isArray(caseBible.scenes) || caseBible.scenes.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki setidaknya satu adegan.");
  }

  if (!Array.isArray(caseBible.timelineEvents) || caseBible.timelineEvents.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki timeline.");
  }

  if (!Array.isArray(caseBible.evidence) || caseBible.evidence.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki bukti.");
  }

  if (!Array.isArray(caseBible.proofNodes) || caseBible.proofNodes.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki proof graph.");
  }

  if (!caseBible.culpritSuspectId || !caseBible.suspects.some((suspect) => suspect.suspectId === caseBible.culpritSuspectId)) {
    throw new KesalahanValidasi("culpritSuspectId harus merujuk ke tersangka yang valid.");
  }

  const validSources = new Set(["VISUAL", "DOCUMENT", "DIGITAL", "TESTIMONIAL", "TIMELINE", "FORENSIC", "ENVIRONMENT"]);
  for (const item of caseBible.evidence) {
    const sumber = (item as { source?: string }).source ?? "VISUAL";
    if (!validSources.has(sumber)) {
      throw new KesalahanValidasi(`Sumber bukti tidak valid: ${item.evidenceId}`);
    }
    if (!item.objectId) {
      throw new KesalahanValidasi(`Bukti belum memiliki objectId: ${item.evidenceId}`);
    }
  }

  if (!Array.isArray(caseBible.proofEdges) || caseBible.proofEdges.length === 0) {
    throw new KesalahanValidasi("Case Bible harus memiliki edge proof minimal.");
  }
}

export function validasiReferensiKasus(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;
  const idsSuspect = new Set(caseBible.suspects.map((suspect) => suspect.suspectId));
  const idsScene = new Set(caseBible.scenes.map((scene) => scene.sceneId));
  const idsObject = new Set(caseBible.objects.map((objek) => objek.objectId));
  const idsEvidence = new Set(caseBible.evidence.map((item) => item.evidenceId));
  const idsStatement = new Set(caseBible.statements.map((item) => item.statementId));
  const idsDialogue = new Set(caseBible.dialogueNodes.map((item) => item.nodeId));
  const idsTimeline = new Set(caseBible.timelineEvents.map((event) => event.eventId));
  const idsProof = new Set(caseBible.proofNodes.map((node) => node.nodeId));
  const idsContradiction = new Set(caseBible.contradictionDefinitions.map((item) => item.contradictionId));

  if (!idsSuspect.has(caseBible.culpritSuspectId)) {
    throw new KesalahanValidasi("Suspect culprit tidak valid dalam Case Bible.");
  }

  for (const objek of caseBible.objects) {
    if (!idsScene.has(objek.sceneId)) {
      throw new KesalahanValidasi(`Object ${objek.objectId} merujuk scene tidak valid.`);
    }
  }

  for (const bukti of caseBible.evidence) {
    if (!idsObject.has(bukti.objectId)) {
      throw new KesalahanValidasi(`Bukti ${bukti.evidenceId} merujuk object tidak valid.`);
    }
  }

  for (const statement of caseBible.statements) {
    if (!idsSuspect.has(statement.suspectId)) {
      throw new KesalahanValidasi(`Statement ${statement.statementId} merujuk suspect tidak valid.`);
    }
  }

  for (const node of caseBible.dialogueNodes) {
    if (!idsSuspect.has(node.suspectId)) {
      throw new KesalahanValidasi(`Node dialog ${node.nodeId} merujuk suspect tidak valid.`);
    }

    for (const prasyarat of node.prasyarat) {
      if (prasyarat.jenis === "EVIDENCE_DISCOVERED" && prasyarat.evidenceId && !idsEvidence.has(prasyarat.evidenceId)) {
        throw new KesalahanValidasi(`Node dialog ${node.nodeId} merujuk evidence tidak valid.`);
      }
      if (prasyarat.jenis === "STATEMENT_UNLOCKED" && prasyarat.statementId && !idsStatement.has(prasyarat.statementId)) {
        throw new KesalahanValidasi(`Node dialog ${node.nodeId} merujuk statement tidak valid.`);
      }
      if (prasyarat.jenis === "DIALOGUE_NODE_UNLOCKED" && prasyarat.nodeId && !idsDialogue.has(prasyarat.nodeId)) {
        throw new KesalahanValidasi(`Node dialog ${node.nodeId} merujuk node dialog tidak valid.`);
      }
      if (prasyarat.jenis === "CONTRADICTION_DISCOVERED" && prasyarat.contradictionId && !idsContradiction.has(prasyarat.contradictionId)) {
        throw new KesalahanValidasi(`Node dialog ${node.nodeId} merujuk contradiction tidak valid.`);
      }
    }

    if (node.unlocksStatementId && !idsStatement.has(node.unlocksStatementId)) {
      throw new KesalahanValidasi(`Node dialog ${node.nodeId} unlocks statement tidak valid.`);
    }

    if (node.unlocksNodeIds) {
      for (const unlockNodeId of node.unlocksNodeIds) {
        if (!idsDialogue.has(unlockNodeId)) {
          throw new KesalahanValidasi(`Node dialog ${node.nodeId} unlocks node dialog tidak valid.`);
        }
      }
    }
  }

  for (const event of caseBible.timelineEvents) {
    if (event.locationId && !idsScene.has(event.locationId)) {
      throw new KesalahanValidasi(`Timeline event ${event.eventId} merujuk lokasi tidak valid.`);
    }
    for (const actorId of event.actorIds) {
      if (!idsSuspect.has(actorId)) {
        throw new KesalahanValidasi(`Timeline event ${event.eventId} merujuk actor tidak valid.`);
      }
    }
    for (const evidenceId of event.relatedEvidenceIds) {
      if (!idsEvidence.has(evidenceId)) {
        throw new KesalahanValidasi(`Timeline event ${event.eventId} merujuk evidence tidak valid.`);
      }
    }
    for (const statementId of event.relatedStatementIds) {
      if (!idsStatement.has(statementId)) {
        throw new KesalahanValidasi(`Timeline event ${event.eventId} merujuk statement tidak valid.`);
      }
    }
  }

  for (const relation of caseBible.causalRelations) {
    if (!idsProof.has(relation.dari) && !idsEvidence.has(relation.dari) && !idsTimeline.has(relation.dari) && !idsStatement.has(relation.dari)) {
      throw new KesalahanValidasi(`Relasi kausal ${relation.dari} tidak valid.`);
    }
    if (!idsProof.has(relation.ke) && !idsEvidence.has(relation.ke) && !idsTimeline.has(relation.ke) && !idsStatement.has(relation.ke)) {
      throw new KesalahanValidasi(`Relasi kausal ${relation.ke} tidak valid.`);
    }
  }

  for (const edge of caseBible.proofEdges) {
    if (!idsProof.has(edge.dari)) {
      throw new KesalahanValidasi(`Edge proof ${edge.dari} tidak valid.`);
    }
    if (!idsProof.has(edge.ke)) {
      throw new KesalahanValidasi(`Edge proof ${edge.ke} tidak valid.`);
    }
  }

  for (const contradiction of caseBible.contradictionDefinitions) {
    if (!idsStatement.has(contradiction.statementId)) {
      throw new KesalahanValidasi(`Contradiction ${contradiction.contradictionId} merujuk statement tidak valid.`);
    }
    if (!idsEvidence.has(contradiction.evidenceId)) {
      throw new KesalahanValidasi(`Contradiction ${contradiction.contradictionId} merujuk evidence tidak valid.`);
    }
    if (!idsSuspect.has(contradiction.relatedSuspectId)) {
      throw new KesalahanValidasi(`Contradiction ${contradiction.contradictionId} merujuk suspect tidak valid.`);
    }
  }
}

export function validasiLinimasa(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;
  const events = [...caseBible.timelineEvents].sort((a, b) => bandingkanWaktu(a, b));

  for (let indeks = 1; indeks < events.length; indeks += 1) {
    const sebelumnya = events[indeks - 1];
    const saatIni = events[indeks];
    if (!sebelumnya || !saatIni) {
      continue;
    }
    if (bandingkanWaktu(saatIni, sebelumnya) < 0) {
      throw new KesalahanValidasi(`Timeline tidak terurut: ${sebelumnya.eventId} > ${saatIni.eventId}`);
    }
  }

  const eventByActor = new Map<string, PeristiwaLinimasa[]>();
  for (const event of events) {
    for (const actorId of event.actorIds) {
      const daftar = eventByActor.get(actorId) ?? [];
      daftar.push(event);
      eventByActor.set(actorId, daftar);
    }
  }

  for (const [actorId, daftar] of eventByActor.entries()) {
    daftar.sort((a, b) => bandingkanWaktu(a, b));
    let lokasiTerakhir: string | null = null;
    let waktuTerakhir: number | null = null;
    for (const event of daftar) {
      const waktuSaatIni = ambilWaktuMenit(event);
      if (waktuTerakhir !== null && waktuSaatIni === waktuTerakhir && lokasiTerakhir !== null && event.locationId && lokasiTerakhir !== event.locationId) {
        throw new KesalahanValidasi(`Gerakan actor ${actorId} tidak mungkin: ${event.eventId} di ${event.locationId} sementara actor sudah berada di ${lokasiTerakhir} pada waktu yang sama.`);
      }
      if (event.locationId) {
        lokasiTerakhir = event.locationId;
        waktuTerakhir = waktuSaatIni;
      }
    }
  }
}

function bandingkanWaktu(a: PeristiwaLinimasa, b: PeristiwaLinimasa): number {
  const waktuA = ambilWaktuMenit(a);
  const waktuB = ambilWaktuMenit(b);
  return waktuA - waktuB;
}

function ambilWaktuMenit(event: PeristiwaLinimasa): number {
  const start = event.timestamp.start ?? "00:00";
  const parsed = parseJam(start);
  if (parsed !== null) {
    return parsed;
  }
  const nomor = Number(start);
  return Number.isFinite(nomor) ? nomor : 0;
}

function parseJam(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const jam = Number(match[1]);
  const menit = Number(match[2]);
  if (Number.isNaN(jam) || Number.isNaN(menit)) {
    return null;
  }

  return jam * 60 + menit;
}

export function validasiKausalitas(kandidat: KandidatKasus): void {
  const relasi = kandidat.caseBible.causalRelations.map((relasiItem) => ({
    dari: relasiItem.dari,
    ke: relasiItem.ke,
    jenis: relasiItem.jenis,
  }));

  validasiRelasiKausal(relasi);

  for (const relasiItem of relasi) {
    if (relasiItem.jenis === "REQUIRES" && (!relasiItem.dari || !relasiItem.ke)) {
      throw new KesalahanValidasi("Relasi kausal REQUIRES membutuhkan node sumber dan tujuan.");
    }
  }
}

export function validasiBukti(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;
  const validTruth = new Set(["TRUE", "FALSE", "PARTIAL", "AMBIGUOUS"]);
  const validRelevance = new Set(["DIRECT", "SUPPORTING", "CONTEXTUAL", "RED_HERRING", "IRRELEVANT"]);
  const objectIds = new Set(caseBible.objects.map((objek) => objek.objectId));

  for (const bukti of caseBible.evidence) {
    if (!validTruth.has(bukti.truthStatus)) {
      throw new KesalahanValidasi(`Bukti ${bukti.evidenceId} memiliki truthStatus tidak valid.`);
    }
    if (!validRelevance.has(bukti.relevance)) {
      throw new KesalahanValidasi(`Bukti ${bukti.evidenceId} memiliki relevance tidak valid.`);
    }
    if (!objectIds.has(bukti.objectId)) {
      throw new KesalahanValidasi(`Bukti ${bukti.evidenceId} merujuk object tidak valid.`);
    }
  }
}

export function validasiDialog(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;
  const idsStatement = new Set(caseBible.statements.map((statement) => statement.statementId));
  const idsNode = new Set(caseBible.dialogueNodes.map((node) => node.nodeId));
  const idsEvidence = new Set(caseBible.evidence.map((item) => item.evidenceId));
  const idsContradiksi = new Set(caseBible.contradictionDefinitions.map((item) => item.contradictionId));

  if (caseBible.dialogueNodes.length > 0) {
    const reachable = new Set<string>();
    const roots = caseBible.dialogueNodes.filter((node) => node.prasyarat.length === 0);
    if (roots.length === 0) {
      throw new KesalahanValidasi("Tidak ada node dialog yang dapat dijangkau di awal.");
    }

    for (const root of roots) {
      reachable.add(root.nodeId);
    }

    const queue = [...roots.map((node) => node.nodeId)];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const node = caseBible.dialogueNodes.find((item) => item.nodeId === current);
      if (!node) {
        continue;
      }
      for (const unlockNodeId of node.unlocksNodeIds ?? []) {
        if (!reachable.has(unlockNodeId)) {
          reachable.add(unlockNodeId);
          queue.push(unlockNodeId);
        }
      }
    }

    for (const node of caseBible.dialogueNodes) {
      for (const prasyarat of node.prasyarat) {
        if (prasyarat.jenis === "EVIDENCE_DISCOVERED" && prasyarat.evidenceId && !idsEvidence.has(prasyarat.evidenceId)) {
          throw new KesalahanValidasi(`Node dialog ${node.nodeId} memerlukan evidence yang tidak ada.`);
        }
        if (prasyarat.jenis === "STATEMENT_UNLOCKED" && prasyarat.statementId && !idsStatement.has(prasyarat.statementId)) {
          throw new KesalahanValidasi(`Node dialog ${node.nodeId} memerlukan statement yang tidak ada.`);
        }
        if (prasyarat.jenis === "DIALOGUE_NODE_UNLOCKED" && prasyarat.nodeId && !idsNode.has(prasyarat.nodeId)) {
          throw new KesalahanValidasi(`Node dialog ${node.nodeId} memerlukan node prerequisite yang tidak ada.`);
        }
        if (prasyarat.jenis === "CONTRADICTION_DISCOVERED" && prasyarat.contradictionId && !idsContradiksi.has(prasyarat.contradictionId)) {
          throw new KesalahanValidasi(`Node dialog ${node.nodeId} memerlukan contradiction yang tidak ada.`);
        }
      }

      if (!reachable.has(node.nodeId)) {
        throw new KesalahanValidasi(`Node dialog ${node.nodeId} tidak dapat dijangkau dari root.`);
      }
    }
  }
}

export function validasiGrafPembuktian(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;
  const idsProof = new Set(caseBible.proofNodes.map((node) => node.nodeId));
  const adjacency = new Map<string, string[]>();

  for (const edge of caseBible.proofEdges) {
    if (!idsProof.has(edge.dari) || !idsProof.has(edge.ke)) {
      throw new KesalahanValidasi(`Edge proof ${edge.dari} -> ${edge.ke} merujuk node yang tidak valid.`);
    }
    const daftar = adjacency.get(edge.dari) ?? [];
    daftar.push(edge.ke);
    adjacency.set(edge.dari, daftar);
  }

  const startNode = caseBible.proofNodes[0]?.nodeId;
  if (!startNode) {
    throw new KesalahanValidasi("Proof graph tidak boleh kosong.");
  }

  const reached = new Set<string>();
  const queue = [startNode];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (reached.has(current)) {
      continue;
    }
    reached.add(current);
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!reached.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  if (reached.size !== caseBible.proofNodes.length) {
    throw new KesalahanValidasi("Proof graph tidak terhubung / terdapat node terisolasi.");
  }

  const solutionNode = caseBible.proofNodes.some((node) => node.kind === "SOLUTION_FACT");
  if (!solutionNode) {
    throw new KesalahanValidasi("Proof graph harus memiliki setidaknya satu node SOLUTION_FACT.");
  }
}

export function ujiKeterpecahanKasus(kandidat: KandidatKasus): boolean {
  const proofNodes = kandidat.caseBible.proofNodes;
  const ids = proofNodes.map((node) => node.nodeId);
  if (proofNodes.length === 0) {
    return false;
  }

  const edges = kandidat.caseBible.proofEdges;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (ids.includes(edge.dari) && ids.includes(edge.ke)) {
      const daftar = adjacency.get(edge.dari) ?? [];
      daftar.push(edge.ke);
      adjacency.set(edge.dari, daftar);
    }
  }

  const start = proofNodes.find((node) => node.kind === "EVIDENCE")?.nodeId ?? proofNodes[0]?.nodeId;
  if (!start) {
    return false;
  }

  const queue = [start];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        queue.push(next);
      }
    }
  }

  return proofNodes.some((node) => node.kind === "SOLUTION_FACT" && seen.has(node.nodeId));
}

export function ujiKeunikanSolusi(kandidat: KandidatKasus): boolean {
  const candidateSolutions = (kandidat as unknown as Record<string, unknown>).solutionCandidates;
  if (Array.isArray(candidateSolutions)) {
    return candidateSolutions.length === 1;
  }

  return kandidat.caseBible.proofNodes.filter((node) => node.kind === "SOLUTION_FACT").length === 1;
}

export function validasiTidakAdaSoftlock(kandidat: KandidatKasus): void {
  const caseBible = kandidat.caseBible;

  for (const proofEdge of caseBible.proofEdges) {
    if (proofEdge.wajib) {
      const mulai = caseBible.proofNodes.find((node) => node.nodeId === proofEdge.dari);
      const akhir = caseBible.proofNodes.find((node) => node.nodeId === proofEdge.ke);
      if (!mulai || !akhir) {
        throw new KesalahanValidasi(`Edge proof wajib ${proofEdge.dari} -> ${proofEdge.ke} tidak valid untuk softlock check.`);
      }
    }
  }

  for (const dialogueNode of caseBible.dialogueNodes) {
    if (dialogueNode.prasyarat.length > 0 && dialogueNode.unlocksNodeIds && dialogueNode.unlocksNodeIds.length > 0) {
      const semuaValid = dialogueNode.unlocksNodeIds.every((nodeId) => caseBible.dialogueNodes.some((item) => item.nodeId === nodeId));
      if (!semuaValid) {
        throw new KesalahanValidasi(`Softlock terdeteksi pada node dialog ${dialogueNode.nodeId}.`);
      }
    }
  }
}

export function validasiKeamananKasus(kandidat: KandidatKasus): void {
  const teks = [
    kandidat.metadata.title,
    kandidat.metadata.premise,
    kandidat.caseBible.title,
    kandidat.caseBible.victim,
    ...kandidat.caseBible.suspects.map((suspect) => suspect.name),
    ...kandidat.caseBible.dialogueNodes.map((node) => node.semanticResponse.text),
    ...kandidat.caseBible.statements.map((statement) => statement.text),
  ].join(" ").toLowerCase();

  const kataTerlarang = ["secret", "token", "credential", "private data", "password", "explicit sexual", "nude"];
  for (const kata of kataTerlarang) {
    if (teks.includes(kata)) {
      throw new KesalahanValidasi(`Konten kasus melanggar moderasi: kata terlarang terdeteksi (${kata}).`);
    }
  }
}

function kumpulkanKesalahanValidasi(kandidat: KandidatKasus): string[] {
  const errors: string[] = [];
  try {
    validasiStrukturKasus(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiReferensiKasus(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiLinimasa(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiKausalitas(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiBukti(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiDialog(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiGrafPembuktian(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  if (!ujiKeterpecahanKasus(kandidat)) {
    errors.push("Kasus tidak terpecahkan secara deterministik.");
  }

  if (!ujiKeunikanSolusi(kandidat)) {
    errors.push("Kasus memiliki lebih dari satu solusi valid.");
  }

  try {
    validasiTidakAdaSoftlock(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  try {
    validasiKeamananKasus(kandidat);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  return errors;
}

export function validasiGerbangPublikasi(
  kandidat: KandidatKasus,
  opsi: { validasiSemua?: boolean } = {},
): HasilValidasiGerbang {
  const hasil = kumpulkanKesalahanValidasi(kandidat);
  const valid = hasil.length === 0;

  if (opsi.validasiSemua && !valid) {
    throw new KesalahanValidasi(`Gerbang publikasi gagal: ${hasil.join("; ")}`);
  }

  return { valid, gagal: hasil };
}

export function publikasikanKandidatKasus(kandidat: KandidatKasus, waktuPublikasi?: string): ReturnType<typeof buatVersiKasus> {
  const errors = kumpulkanKesalahanValidasi(kandidat);
  if (errors.length > 0) {
    throw new KesalahanValidasi(`Kandidat tidak lolos gerbang publikasi: ${errors.join("; ")}`);
  }

  const caseId = buatIdKasus(kandidat.caseId);
  const versionId = buatIdVersiKasus(kandidat.versionId);
  const waktu = waktuPublikasi ?? new Date().toISOString();

  const versi = buatVersiKasus({
    caseId,
    versionId,
    schemaVersion: kandidat.generation.schemaVersion,
    metadata: {
      title: kandidat.metadata.title,
      premise: kandidat.metadata.premise,
      genre: kandidat.metadata.genre,
      tags: kandidat.metadata.tags,
      starRating: kandidat.metadata.starRating,
    },
    caseBibleRef: kandidat.caseBibleRef,
    assetManifestRef: kandidat.assetManifestRef,
    contentSummary: `Generated case: ${kandidat.metadata.title}`,
    status: StatusVersiKasus.PUBLISHED,
    publishedAt: buatWaktuIso(waktu),
  });

  return Object.freeze(versi);
}

export function buatVersiKasusDariKandidat(kandidat: KandidatKasus, waktuPublikasi?: string): ReturnType<typeof buatVersiKasus> {
  return publikasikanKandidatKasus(kandidat, waktuPublikasi);
}

export const DESKRIPSI_SKEMA_KANDIDAT = [
  "Skema JSON Kandidat Kasus (wajib persis):",
  "- Top-level: caseId: string, versionId: string, title: string, premise: string, genre: string, tags: string[], caseBible: { ... }",
  "- caseBible.caseBibleRef: string (mis. \"case-bible:CASE-900:main\"), caseId: string (samakan top-level), title: string, victim: string, culpritSuspectId: string (harus cocok suspects[].suspectId)",
  "- caseBible.scenes: [{ sceneId: string, name: string }]  // minimal 1",
  "- caseBible.objects: [{ objectId, sceneId (harus ada di scenes), name, modeDiscovery: AUTO|CONDITIONAL|HIDDEN, prasyarat?: [{ evidenceDiscovered: string }], evidenceId?: string }]",
  "- caseBible.observations: [{ observationId, objectId (harus ada di objects), text }]",
  "- caseBible.evidence: [{ evidenceId, objectId (harus ada di objects), truthStatus: TRUE|FALSE|PARTIAL|AMBIGUOUS, relevance: DIRECT|SUPPORTING|CONTEXTUAL|RED_HERRING|IRRELEVANT, source: VISUAL|DOCUMENT|DIGITAL|TESTIMONIAL|TIMELINE|FORENSIC|ENVIRONMENT, relatedSuspects?: string[], relatedTimelineEvents?: string[] }]",
  "- caseBible.suspects: [{ suspectId, name, relationship, occupation, publicProfile }]  // minimal 1",
  "- caseBible.statements: [{ statementId, suspectId (harus ada), text, claim: { subject,predicate,value } }]",
  "- caseBible.dialogueNodes: [{ nodeId, suspectId (harus ada), intents: ASK_ALIBI|ASK_VICTIM|ASK_MOTIVE|ASK_TIMELINE|ASK_RELATIONSHIP|ASK_EVIDENCE|CONFRONT_EVIDENCE, prasyarat: [{ jenis: EVIDENCE_DISCOVERED|STATEMENT_UNLOCKED|DIALOGUE_NODE_UNLOCKED|CONTRADICTION_DISCOVERED }], semanticResponse: { text }, unlocksStatementId?, unlocksNodeIds? }]",
  "- caseBible.timelineEvents: [{ eventId, timestamp: { precision: EXACT|APPROXIMATE|RANGE|UNKNOWN, start: 'HH:MM', end?: string }, locationId?, actorIds: string[] (suspectIds), action: string, truthStatus: TRUE|FALSE|PARTIAL|UNKNOWN, relatedEvidenceIds: string[], relatedStatementIds: string[] }]  // minimal 1",
  "- caseBible.causalRelations: [{ dari: string, ke: string, jenis: CAUSES|REQUIRES|ENABLES|PREVENTS|FOLLOWS|CONTRADICTS }]  // edge dependency CAUSES/REQUIRES/ENABLES/FOLLOWS tidak boleh membentuk cycle",
  "- caseBible.proofNodes: [{ nodeId, kind: EVIDENCE|EVENT|INFERENCE|STATEMENT|SOLUTION_FACT }]  // minimal 1 SOLUTION_FACT, terhubung, tidak terisolasi",
  "- caseBible.proofEdges: [{ dari: string, ke: string, relasi: SUPPORTS|CONTRADICTS|ESTABLISHES|REQUIRES|COMBINES_WITH, wajib: boolean }]",
  "- caseBible.contradictionDefinitions: [{ contradictionId, statementId (harus ada), evidenceId (harus ada), severity: MINOR|SIGNIFICANT|CRITICAL, relatedSuspectId (harus ada), unlocksNodeId?, revealsTimelineEventId? }]",
  "- Aturan dialogue: (1) minimal 1 node dengan prasyarat=[] (root); (2) setiap unlocksNodeIds/unlocksStatementId/unlocksNodeId/contradictionId/timelineEventId HARUS merujuk ID yang benar-benar ada; (3) dialogueNodes yang tidak terjangkau dari root → GAGAL. Untuk aman: buat SETIAP dialogueNode dengan prasyarat=[].",
  "- Aturan proof graph: (1) semua proofNodes harus terjangkau dari proofNodes[0] lewat proofEdges (tidak ada node terisolasi); tepat 1 node kind=SOLUTION_FACT; (2) causalRelations 'dari'/'ke' hanya memakai evidenceId/timelineEventId/statementId/proofNodeId yang sudah terdaftar (jangan memakai contradictionId). Topologi WAJIB (fan-in forward, tanpa edge mundur): proofNodes[0] = EVIDENCE pertama; lalu SEMUA node lain dirantai dari situ: E01→T01, T01→SOL_01, dan setiap evidence tambahan E0X→T0Y yang SUDAH ada di rantai. DILARANG: edge dari node belakangan ke node depanan (mis. E02→T01 bila E02 didaftar SETELAH SOL_01). Urutan proofNodes harus mengikuti aliran: semua EVIDENCE dulu, lalu EVENT, lalu INFERENCE (opsional), lalu SOLUTION_FACT terakhir.",
  "- Semua ID saling merujuk wajib valid (proofEdges.dari/ke ada di proofNodes; evidence.objectId ada di objects; objects.sceneId ada di scenes; dll).",
  "- Jangan tambahkan field terlarang (secret/password/apiKey/token/credential).",
  "- Jangan memakai kata-kata ini di mana pun (termasuk title/premise/nama/dialog/statement/claim) — output yang mengandungnya DITOLAK TOTAL: secret, token, credential, credentials, password, 'private data', 'explicit sexual', nude. Ganti dengan: 'hidden truth'→'buried fact', 'secret'→'concealed', 'password'→'passcode lock', 'token'→'keepsake'. Periksa ulang seluruh output sebelum menjawab; jika ada kata itu, tulis ulang bagiannya.",
  "- Hanya JSON (tanpa markdown, tanpa penjelasan luar).",
].join("\n");

export const CONTOH_MINIMAL_KANDIDAT = JSON.stringify(
  {
    caseId: "CASE-900",
    versionId: "v-900",
    title: "The Locked Ward",
    premise: "A nurse hides a weapon beneath the cabinet.",
    genre: "MYSTERY",
    tags: ["mystery", "ward"],
    caseBible: {
      caseBibleRef: "case-bible:CASE-900:main",
      caseId: "CASE-900",
      title: "The Locked Ward",
      victim: "Evelyn Cross",
      culpritSuspectId: "S01",
      scenes: [
        { sceneId: "SCENE_01", name: "Ward" },
        { sceneId: "SCENE_02", name: "Corridor" },
      ],
      objects: [
        { objectId: "OBJ_01", sceneId: "SCENE_01", name: "Glass shard", modeDiscovery: "AUTO", evidenceId: "E01" },
        { objectId: "OBJ_02", sceneId: "SCENE_01", name: "Medicine cabinet", modeDiscovery: "AUTO", evidenceId: "E02" },
      ],
      observations: [
        { observationId: "OBS_01", objectId: "OBJ_01", text: "A shattered glass lies by the bed." },
        { observationId: "OBS_02", objectId: "OBJ_02", text: "The cabinet is open." },
      ],
      evidence: [
        { evidenceId: "E01", objectId: "OBJ_01", source: "FORENSIC", truthStatus: "TRUE", relevance: "DIRECT", relatedSuspects: ["S01"], relatedTimelineEvents: ["T01"] },
        { evidenceId: "E02", objectId: "OBJ_02", source: "ENVIRONMENT", truthStatus: "TRUE", relevance: "SUPPORTING", relatedSuspects: ["S02"], relatedTimelineEvents: ["T02"] },
      ],
      suspects: [
        { suspectId: "S01", name: "Mira Holt", relationship: "former nurse", occupation: "Nurse", publicProfile: "kept secrets" },
        { suspectId: "S02", name: "Owen Dale", relationship: "colleague", occupation: "Doctor", publicProfile: "shared history" },
      ],
      statements: [{ statementId: "ST01", suspectId: "S01", text: "I never left the ward.", claim: { subject: "Mira", predicate: "was in", value: "the ward" } }],
      dialogueNodes: [{ nodeId: "D01", suspectId: "S01", intents: ["ASK_ALIBI"], prasyarat: [], semanticResponse: { text: "I never left the ward." }, unlocksStatementId: "ST01" }],
      timelineEvents: [
        { eventId: "T01", timestamp: { precision: "EXACT", start: "21:00" }, locationId: "SCENE_01", actorIds: ["S01"], action: "Mira enters the ward", truthStatus: "TRUE", relatedEvidenceIds: ["E01"], relatedStatementIds: ["ST01"] },
        { eventId: "T02", timestamp: { precision: "EXACT", start: "21:30" }, locationId: "SCENE_01", actorIds: ["S02"], action: "Owen checks cabinet", truthStatus: "TRUE", relatedEvidenceIds: ["E02"], relatedStatementIds: [] },
      ],
      causalRelations: [
        { dari: "E01", ke: "T01", jenis: "REQUIRES" },
        { dari: "T01", ke: "SOL_01", jenis: "CAUSES" },
        { dari: "E02", ke: "SOL_01", jenis: "CAUSES" },
      ],
      proofNodes: [
        { nodeId: "E01", kind: "EVIDENCE" },
        { nodeId: "T01", kind: "EVENT" },
        { nodeId: "SOL_01", kind: "SOLUTION_FACT" },
      ],
      proofEdges: [
        { dari: "E01", ke: "T01", relasi: "SUPPORTS", wajib: true },
        { dari: "T01", ke: "SOL_01", relasi: "ESTABLISHES", wajib: true },
      ],
      contradictionDefinitions: [{ contradictionId: "C01", statementId: "ST01", evidenceId: "E01", severity: "CRITICAL", relatedSuspectId: "S01", unlocksNodeId: "D01" }],
    },
  },
  null,
  2,
);

export const CASE_GENERATION_INVARIANTS = [  "AI_CASE_01 — truth-first generation before narrative",
  "AI_CASE_02 — malformed or invalid JSON rejected without silent repair",
  "AI_CASE_03 — published CaseVersion remains immutable",
  "AI_CASE_04 — generation happens outside runtime gameplay and Firestore transaction",
  "AI_CASE_05 — only validated candidate may publish",
] as const;
