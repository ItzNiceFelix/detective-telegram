import type { IdEvent, IdGrup, IdPemain, IdSesiKasus } from "../domain/types.js";
import type { JenisKejadianDomain } from "../domain/enums.js";

export interface DomainEvent {
  eventId: IdEvent;
  eventVersion: number;
  sessionId?: IdSesiKasus;
  groupId?: IdGrup;
  actorUserId?: IdPemain | null;
  type: JenisKejadianDomain;
  payload: Record<string, unknown>;
  actionId?: string | null;
  occurredAt: string;
}

export interface PenerbitEvent {
  kirim(event: DomainEvent): Promise<void>;
}

export interface PencatatEvent {
  catat(event: DomainEvent): Promise<void>;
}
