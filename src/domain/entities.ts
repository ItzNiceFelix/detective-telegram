import type { IdGrup, IdKasus, IdPemain, IdSesiKasus, IdVersiKasus, WaktuIso } from "./types.js";
import type { HasilSesi, RolePemain, StatusBukti, StatusSesi } from "./enums.js";
import type { TeoriKasus } from "./services/teori.js";
import type { ProposalTuduhan, TuduhanAkhir } from "./services/tuduhan.js";


export interface Pengguna {
  userId: IdPemain;
  telegramUserId: string;
  usernameSnapshot?: string | undefined;
  language: string;
  createdAt: WaktuIso;
  lastActiveAt?: WaktuIso | undefined;
}

export interface Grup {
  groupId: IdGrup;
  telegramChatId: string;
  createdAt: WaktuIso;
  status: "ACTIVE" | "DISABLED";
  activeCaseSessionId?: IdSesiKasus | undefined;
}

export interface VersiKasus {
  caseId: IdKasus;
  versionId: IdVersiKasus;
  schemaVersion: number;
  contentHash: string;
  status: "DRAFT" | "PUBLISHED" | "DISABLED";
  metadata: {
    title: string;
    premise: string;
    genre: string;
    tags: string[];
    starRating?: 1 | 2 | 3 | 4 | 5 | undefined;
  };
  caseBibleRef: string;
  assetManifestRef: string;
  contentSummary: string;
  publishedAt?: WaktuIso | undefined;
}

export interface SesiKasus {
  sessionId: IdSesiKasus;
  caseId: IdKasus;
  caseVersionId: IdVersiKasus;
  groupId: IdGrup;
  status: StatusSesi;
  outcome: HasilSesi | null;
  playerIds: IdPemain[];
  currentSceneId?: string | undefined;
  discoveredEvidenceIds: string[];
  examinedObjectIds: string[];
  unlockedDialogueIds: string[];
  teamTheory: string | null;
  score: number;
  startedAt?: WaktuIso | undefined;
  updatedAt: WaktuIso;
  lastActivityAt?: WaktuIso | undefined;
  solvedAt?: WaktuIso | undefined;
  unlockedStatementIds: string[];
  discoveredContradictionIds: string[];
  knownTimelineEventIds: string[];
  currentTheory?: TeoriKasus | null | undefined;
  accusationProposal?: ProposalTuduhan | null | undefined;
  finalAccusation?: TuduhanAkhir | null | undefined;
  contributionRecordIds?: string[] | undefined; // idempotency dedupe set, bounded (few dozen max)
  resolutionSnapshotRef?: string | undefined;
}

export interface ObjekDapatDiperiksa {
  objectId: string;
  sceneId: string;
  name: string;
  visibility: "OBVIOUS" | "NOTICEABLE" | "SUBTLE" | "HIDDEN";
  interaction: "INSPECT" | "INTERACT";
  discoveryRules: string[];
}

export interface Bukti {
  evidenceId: string;
  source: string;
  truthStatus: "TRUE" | "FALSE" | "PARTIAL" | "AMBIGUOUS";
  relevance: string;
  fact?: string;
  discoveryRules: string[];
  status: StatusBukti;
  relatedSuspects?: string[];
}

export interface DetektifSession {
  userId: IdPemain;
  role: RolePemain;
  joinedAt: WaktuIso;
}
