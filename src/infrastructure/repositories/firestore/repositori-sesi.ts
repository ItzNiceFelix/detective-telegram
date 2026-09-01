import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { SesiKasus } from "../../../domain/entities.js";
import type { IdSesiKasus } from "../../../fondasi/primitif.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";

export interface KontrakRepositoriSesiFirestore {
  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export class RepositoriSesiFirestore implements KontrakRepositoriSesiFirestore {
  constructor(private readonly firestore: Firestore) {}

  private readonly namaKoleksi = "case_sessions";

  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null> {
    const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(String(sessionId));
    const operasiDokumen = transaction ? transaction.get(dokumenRef) : dokumenRef.get();

    return Promise.resolve(operasiDokumen)
      .then((dokumen) => {
        if (!dokumen.exists) {
          return null;
        }

        return this.deserialize(dokumen.data() ?? {});
      })
      .catch((error) => {
        throw mapErrorFirestore(error);
      });
  }

  async simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus> {
    try {
      const data = this.serialize(sesi);
      const dokumenRef = this.firestore.collection(this.namaKoleksi).doc(String(sesi.sessionId));

      if (transaction) {
        transaction.set(dokumenRef, data);
        return sesi;
      }

      await dokumenRef.set(data);
      return sesi;
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

  async transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.firestore.runTransaction(runner);
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }

    private serialize(sesi: SesiKasus): Record<string, unknown> {
    return {
      sessionId: String(sesi.sessionId),
      caseId: String(sesi.caseId),
      caseVersionId: String(sesi.caseVersionId),
      groupId: String(sesi.groupId),
      status: sesi.status,
      outcome: sesi.outcome,
      playerIds: sesi.playerIds.map((playerId) => String(playerId)),
      currentSceneId: sesi.currentSceneId ?? null,
      discoveredEvidenceIds: sesi.discoveredEvidenceIds,
      examinedObjectIds: sesi.examinedObjectIds,
      unlockedDialogueIds: sesi.unlockedDialogueIds,
      teamTheory: sesi.teamTheory,
      score: sesi.score,
      startedAt: sesi.startedAt ?? null,
      updatedAt: sesi.updatedAt,
      lastActivityAt: sesi.lastActivityAt ?? null,
      solvedAt: sesi.solvedAt ?? null,
      unlockedStatementIds: sesi.unlockedStatementIds,
      discoveredContradictionIds: sesi.discoveredContradictionIds,
      knownTimelineEventIds: sesi.knownTimelineEventIds,
      currentTheory: sesi.currentTheory ?? null,
      accusationProposal: sesi.accusationProposal ?? null,
      finalAccusation: sesi.finalAccusation ?? null,
      contributionRecordIds: sesi.contributionRecordIds ?? [],
    };
  }

  private deserialize(data: Record<string, unknown>): SesiKasus {
    return {
      sessionId: String(data.sessionId) as IdSesiKasus,
      caseId: String(data.caseId) as SesiKasus["caseId"],
      caseVersionId: String(data.caseVersionId) as SesiKasus["caseVersionId"],
      groupId: String(data.groupId) as SesiKasus["groupId"],
      status: data.status as SesiKasus["status"],
      outcome: data.outcome as SesiKasus["outcome"],
      playerIds: Array.isArray(data.playerIds) ? data.playerIds.map((value) => String(value)) as SesiKasus["playerIds"] : [],
      currentSceneId: typeof data.currentSceneId === "string" ? data.currentSceneId : undefined,
      discoveredEvidenceIds: Array.isArray(data.discoveredEvidenceIds) ? data.discoveredEvidenceIds.map(String) : [],
      examinedObjectIds: Array.isArray(data.examinedObjectIds) ? data.examinedObjectIds.map(String) : [],
      unlockedDialogueIds: Array.isArray(data.unlockedDialogueIds) ? data.unlockedDialogueIds.map(String) : [],
      teamTheory: typeof data.teamTheory === "string" ? data.teamTheory : null,
      score: typeof data.score === "number" ? data.score : 0,
      startedAt: typeof data.startedAt === "string" ? data.startedAt as SesiKasus["startedAt"] : undefined,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt as SesiKasus["updatedAt"] : new Date().toISOString() as SesiKasus["updatedAt"],
      lastActivityAt: typeof data.lastActivityAt === "string" ? data.lastActivityAt as SesiKasus["lastActivityAt"] : undefined,
      solvedAt: typeof data.solvedAt === "string" ? data.solvedAt as SesiKasus["solvedAt"] : undefined,
      unlockedStatementIds: Array.isArray(data.unlockedStatementIds) ? data.unlockedStatementIds.map(String) : [],
      discoveredContradictionIds: Array.isArray(data.discoveredContradictionIds) ? data.discoveredContradictionIds.map(String) : [],
      knownTimelineEventIds: Array.isArray(data.knownTimelineEventIds) ? data.knownTimelineEventIds.map(String) : [],
      currentTheory: (data.currentTheory as SesiKasus["currentTheory"]) ?? null,
      accusationProposal: (data.accusationProposal as SesiKasus["accusationProposal"]) ?? null,
      finalAccusation: (data.finalAccusation as SesiKasus["finalAccusation"]) ?? null,
      contributionRecordIds: Array.isArray(data.contributionRecordIds) ? data.contributionRecordIds.map(String) : [],
    };
  }
}
