import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { KejadianDomain, PenerbitEventDomain } from "../../event/domain.js";
import type { IdEvent, IdSesiKasus } from "../../fondasi/primitif.js";
import { apakahDokumenSudahAda, mapErrorFirestore } from "../firebase/error-mapper.js";
import type { LoggerStruktur } from "../../observability/logger.js";

/**
 * Penerbit event domain berbasis Firestore (event persistence).
 *
 * Path mengikuti persistence contract (docs/17.2):
 *   case_sessions/{sessionId}/events/{eventId}
 *
 * Aturan:
 * - Event immutable — ditulis dengan create(); eventId duplikat tidak akan
 *   menghasilkan dua dokumen (ALREADY_EXISTS = no-op).
 * - eventId deterministik dari actionId+type, sehingga retry delivery tidak
 *   pernah membuat event kedua.
 * - `kirim` = persist event (dipakai post-commit). `tulisDalamTransaksi` =
 *   persist atomic bersama mutasi kanonik. External side effect (Telegram)
 *   bukan bagian dari kelas ini dan selalu berjalan setelah commit (PERSIST-07).
 */
export class PenerbitAcaraDomainFirestore implements PenerbitEventDomain {
  constructor(
    private readonly firestore: Firestore,
    private readonly logger?: LoggerStruktur,
  ) {}

  private readonly namaKoleksiSesi = "case_sessions";
  private readonly namaKoleksiEvent = "events";

  private refEvent(sessionId: IdSesiKasus, eventId: IdEvent) {
    return this.firestore
      .collection(this.namaKoleksiSesi)
      .doc(String(sessionId))
      .collection(this.namaKoleksiEvent)
      .doc(String(eventId));
  }

  private serialize(event: KejadianDomain): Record<string, unknown> {
    return {
      eventId: String(event.eventId),
      eventVersion: event.eventVersion,
      sessionId: event.sessionId ? String(event.sessionId) : null,
      groupId: event.groupId ? String(event.groupId) : null,
      actorUserId: event.actorUserId ? String(event.actorUserId) : null,
      type: String(event.type),
      payload: event.payload,
      actionId: event.actionId ?? null,
      occurredAt: String(event.occurredAt),
    };
  }

  async kirim(event: KejadianDomain): Promise<void> {
    if (!event.sessionId) {
      this.logger?.warn("event_tanpa_session_dilewati", { eventId: String(event.eventId), type: String(event.type) });
      return;
    }

    try {
      await this.refEvent(event.sessionId, event.eventId).create(this.serialize(event));
    } catch (error) {
      if (apakahDokumenSudahAda(error)) {
        // Immutable + dedupe: eventId duplikat tidak menghasilkan event kedua.
        return;
      }
      throw mapErrorFirestore(error);
    }
  }

  tulisDalamTransaksi(event: KejadianDomain, transaction: Transaction): void {
    if (!event.sessionId) {
      throw new Error("Event dalam transaction wajib memiliki sessionId.");
    }
    transaction.create(this.refEvent(event.sessionId, event.eventId), this.serialize(event));
  }
}

export function buatPenerbitAcaraDomain(firestore: Firestore, logger?: LoggerStruktur): PenerbitAcaraDomainFirestore {
  return new PenerbitAcaraDomainFirestore(firestore, logger);
}