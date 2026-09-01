import type { WaktuIso } from "../fondasi/primitif.js";
import type { StatusDukunganBukti } from "./services/graf-pembuktian.js";

export interface TeoriKasus {
  theoryId: string;
  sessionId: string;
  updatedBy: string;
  culpritSuspectId: string | null;
  motiveId: string | null;
  methodId: string | null;
  timelineHypothesisEventIds: string[];
  evidenceRefs: string[];
  createdAt: WaktuIso;
  updatedAt: WaktuIso;
  support: StatusDukunganBukti;
}

export type StatusProposalTuduhan = "OPEN" | "QUALIFIED" | "REJECTED" | "EXPIRED" | "FINALIZED";

export interface ProposalTuduhan {
  proposalId: string;
  sessionId: string;
  suspectId: string;
  motiveId?: string | null | undefined;
  methodId?: string | null | undefined;
  proposerId: string;
  votes: string[];
  status: StatusProposalTuduhan;
  createdAt: WaktuIso;
  qualifiedAt?: WaktuIso | undefined;
}

export interface TuduhanAkhir {
  suspectId: string;
  motiveId?: string | null;
  methodId?: string | null;
  resolvedAt: WaktuIso;
  correctCulprit: boolean;
}

export interface SnapshotPenyelesaian {
  sessionId: string;
  caseId: string;
  finalAccusation: TuduhanAkhir;
  canonicalCulpritSuspectId: string;
  outcome: "SOLVED" | "FAILED";
  groupScore: number;
  contributionBreakdown: Array<{ playerId: string; points: number }>;
  completedAt: WaktuIso;
}