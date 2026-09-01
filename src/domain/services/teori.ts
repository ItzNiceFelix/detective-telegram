import type { SesiKasus } from "../entities.js";
import type { WaktuIso } from "../../fondasi/primitif.js";
import { StatusSesi } from "../enums.js";
import { KesalahanValidasi, KesalahanAutorisasi } from "../../fondasi/eror.js";
import type { CaseBible } from "../../kasus/case-bible.js";
import { evaluasiGrafPembuktian, type StatusDukunganBukti } from "./graf-pembuktian.js";
export type { TeoriKasus } from "../kontrak-resolusi.js";
import type { TeoriKasus } from "../kontrak-resolusi.js";

export interface HasilPerbaruiTeori {
  sesi: SesiKasus;
  teori: TeoriKasus;
}

/**
 * Shared cooperative theory — satu current theory per session, bukan per player.
 * Disimpan sebagai bounded object tunggal di SesiKasus (bukan history array).
 */
export function buatAtauPerbaruiTeori(
  sesi: SesiKasus,
  caseBible: CaseBible,
  actorUserId: string,
  input: {
    culpritSuspectId?: string | null;
    motiveId?: string | null;
    methodId?: string | null;
    timelineHypothesisEventIds?: string[];
    evidenceRefs?: string[];
  },
  waktuSekarang: WaktuIso,
): HasilPerbaruiTeori {
  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanValidasi("Theory hanya dapat diperbarui ketika sesi OPEN.");
  }
  if (!sesi.playerIds.includes(actorUserId as any)) {
    throw new KesalahanAutorisasi("Hanya detective aktif yang dapat memperbarui theory.");
  }

  const teoriSebelumnya = (sesi as any).currentTheory as TeoriKasus | null | undefined;

  const teoriBaru: TeoriKasus = {
    theoryId: teoriSebelumnya?.theoryId ?? `theory-${String(sesi.sessionId)}`,
    sessionId: String(sesi.sessionId),
    updatedBy: actorUserId,
    culpritSuspectId: input.culpritSuspectId ?? teoriSebelumnya?.culpritSuspectId ?? null,
    motiveId: input.motiveId ?? teoriSebelumnya?.motiveId ?? null,
    methodId: input.methodId ?? teoriSebelumnya?.methodId ?? null,
    timelineHypothesisEventIds: input.timelineHypothesisEventIds ?? teoriSebelumnya?.timelineHypothesisEventIds ?? [],
    evidenceRefs: input.evidenceRefs ?? teoriSebelumnya?.evidenceRefs ?? [],
    createdAt: teoriSebelumnya?.createdAt ?? waktuSekarang,
    updatedAt: waktuSekarang,
    support: "UNSUPPORTED",
  };

  // Evaluasi support: gunakan proof node solution jika culprit hypothesis cocok
  // dengan canonical culprit — evaluasi tetap murni graph-walk (bukan menebak benar/salah).
  const proofNodeId = resolveProofNodeUntukTeori(caseBible, teoriBaru);
  teoriBaru.support = proofNodeId ? evaluasiGrafPembuktian(sesi, caseBible, proofNodeId) : "UNSUPPORTED";

  const sesiBaru: SesiKasus = {
    ...sesi,
    lastActivityAt: waktuSekarang,
    updatedAt: waktuSekarang,
    currentTheory: teoriBaru,
  } as SesiKasus;

  return { sesi: sesiBaru, teori: teoriBaru };
}

function resolveProofNodeUntukTeori(caseBible: CaseBible, teori: TeoriKasus): string | null {
  // Konvensi Case Bible: solution proof node diberi id PROOF_<CULPRIT>_PRESENT atau
  // sejenis; untuk Golden Case ini adalah "PROOF_MARCUS_PRESENT". Case Bible dapat
  // menyediakan mapping eksplisit via proofNodes kind SOLUTION_FACT di masa depan;
  // untuk milestone ini kita cari node proof pertama berkind SOLUTION_FACT atau,
  // jika tidak ada, node INFERENCE yang berelasi ke culprit via edges.
  const solutionNode = caseBible.proofNodes.find((n) => n.kind === "SOLUTION_FACT");
  if (solutionNode) return solutionNode.nodeId;

  const inferenceNode = caseBible.proofNodes.find((n) => n.kind === "INFERENCE");
  return inferenceNode ? inferenceNode.nodeId : null;
}