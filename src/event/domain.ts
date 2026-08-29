import type { Transaction } from "firebase-admin/firestore";
import type { IdEvent, IdGrup, IdPemain, IdSesiKasus, WaktuIso } from "../fondasi/primitif.js";

export enum JenisKejadianDomain {
  PLAYER_JOINED = "PLAYER_JOINED",
  PLAYER_LEFT = "PLAYER_LEFT",
  EVIDENCE_DISCOVERED = "EVIDENCE_DISCOVERED",
  CONTRADICTION_FOUND = "CONTRADICTION_FOUND",
  CONFRONTATION_SUCCESS = "CONFRONTATION_SUCCESS",
  THEORY_UPDATED = "THEORY_UPDATED",
  HINT_USED = "HINT_USED",
  ACCUSATION_PROPOSED = "ACCUSATION_PROPOSED",
  ACCUSATION_QUALIFIED = "ACCUSATION_QUALIFIED",
  FINAL_ACCUSATION = "FINAL_ACCUSATION",
  CASE_CLEARED = "CASE_CLEARED",
  CASE_ARCHIVED = "CASE_ARCHIVED",
  CASE_PUBLISHED = "CASE_PUBLISHED",
  CASE_DISABLED = "CASE_DISABLED",
  USER_BLOCKED = "USER_BLOCKED",
  GROUP_DISABLED = "GROUP_DISABLED",
  XP_EARNED = "XP_EARNED",
  ACHIEVEMENT_UNLOCKED = "ACHIEVEMENT_UNLOCKED",
}

export interface KejadianDomain {
  eventId: IdEvent;
  eventVersion: number;
  sessionId?: IdSesiKasus;
  groupId?: IdGrup;
  actorUserId?: IdPemain | null;
  type: JenisKejadianDomain;
  payload: Record<string, unknown>;
  actionId?: string | null;
  occurredAt: WaktuIso;
}

export interface PenerbitEventDomain {
  kirim(event: KejadianDomain): Promise<void>;
}

export interface PencatatEventDomain {
  catat(event: KejadianDomain): Promise<void>;
}

export interface MetadataIdempoten {
  actionId: string;
  sessionId: IdSesiKasus;
  repeated: boolean;
}

export interface KontrakIdempoten {
  ambilKunci(actionId: string, sessionId: IdSesiKasus, transaction?: Transaction): Promise<MetadataIdempoten | null>;
  simpanKunci(metadata: MetadataIdempoten, transaction?: Transaction): Promise<void>;
}
