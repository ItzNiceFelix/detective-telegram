import test from "node:test";
import assert from "node:assert/strict";

import type { Transaction } from "firebase-admin/firestore";
import { buatPenerbitAcaraDomain, PenerbitAcaraDomainFirestore } from "../../src/infrastructure/events/penerbit-acara-domain.js";
import { JenisKejadianDomain } from "../../src/domain/enums.js";
import { buatIdEvent, buatIdGrup, buatIdPemain, buatIdSesiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import type { KejadianDomain } from "../../src/event/domain.js";
import { FirestorePalsu } from "./fake-firestore.js";

function buatEvent(overrides: Partial<KejadianDomain> = {}): KejadianDomain {
  return {
    eventId: buatIdEvent("evt-telegram:update:9-CASE_SESSION_CREATED"),
    eventVersion: 1,
    sessionId: buatIdSesiKasus("sesi-1"),
    groupId: buatIdGrup("-1001"),
    actorUserId: buatIdPemain("42"),
    type: JenisKejadianDomain.CASE_SESSION_CREATED,
    payload: { caseId: "CASE-001" },
    actionId: "telegram:update:9",
    occurredAt: buatWaktuIso("2026-02-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buatEventTanpaSesi(): KejadianDomain {
  const event = buatEvent();
  const tanpaSesi = event as { sessionId?: unknown };
  delete tanpaSesi.sessionId;
  return event;
}

test("event dipersist pada path case_sessions/{sessionId}/events/{eventId}", async () => {
  const firestore = new FirestorePalsu();
  const penerbit = buatPenerbitAcaraDomain(firestore as never);

  await penerbit.kirim(buatEvent());

  const event = firestore.ambilDokumen("case_sessions/sesi-1/events", "evt-telegram:update:9-CASE_SESSION_CREATED");
  assert.ok(event);
  assert.equal(event?.eventId, "evt-telegram:update:9-CASE_SESSION_CREATED");
  assert.equal(event?.type, "CASE_SESSION_CREATED");
  assert.equal(event?.actionId, "telegram:update:9");
  assert.deepEqual(Object.keys(event ?? {}).sort(), [
    "actionId", "actorUserId", "eventId", "eventVersion", "groupId", "occurredAt", "payload", "sessionId", "type",
  ].sort());
});

test("duplicate event ID tidak menghasilkan dua event (immutable)", async () => {
  const firestore = new FirestorePalsu();
  const penerbit = buatPenerbitAcaraDomain(firestore as never);

  await penerbit.kirim(buatEvent());
  await penerbit.kirim(buatEvent());

  assert.equal(firestore.jumlahDokumen("case_sessions/sesi-1/events"), 1);
});

test("event atomic dengan mutasi kanonik: commit bersama", async () => {
  const firestore = new FirestorePalsu();
  const penerbit = buatPenerbitAcaraDomain(firestore as never);

  await (firestore as unknown as { runTransaction: (r: (tx: Transaction) => Promise<void>) => Promise<void> }).runTransaction(async (tx) => {
    // mutasi kanonik (set dokumen sesi) + event dalam transaction yang sama.
    tx.set((firestore as unknown as { collection: (n: string) => { doc: (id: string) => unknown } }).collection("case_sessions").doc("sesi-1") as never, { sessionId: "sesi-1" });
    penerbit.tulisDalamTransaksi(buatEvent(), tx);
  });

  assert.equal(firestore.jumlahDokumen("case_sessions"), 1);
  assert.equal(firestore.jumlahDokumen("case_sessions/sesi-1/events"), 1);
});

test("event atomic: mutasi gagal → event ikut tidak tersimpan", async () => {
  const firestore = new FirestorePalsu();
  const penerbit = buatPenerbitAcaraDomain(firestore as never);

  await assert.rejects(
    () =>
      (firestore as unknown as { runTransaction: (r: (tx: Transaction) => Promise<void>) => Promise<void> }).runTransaction(async (tx) => {
        penerbit.tulisDalamTransaksi(buatEvent(), tx);
        throw new Error("mutasi kanonik gagal");
      }),
  );

  // Transaction gagal → event tidak tertulis (tidak ada partial write).
  assert.equal(firestore.jumlahDokumen("case_sessions/sesi-1/events"), 0);
  assert.equal(firestore.jumlahDokumen("case_sessions"), 0);
});

test("event tanpa sessionId dilewati tanpa crash", async () => {
  const firestore = new FirestorePalsu();
  const penerbit = buatPenerbitAcaraDomain(firestore as never);

  await penerbit.kirim(buatEventTanpaSesi());
  assert.equal(firestore.jumlahDokumen("case_sessions"), 0);
});

test("tulisDalamTransaksi menolak event tanpa sessionId", () => {
  const firestore = new FirestorePalsu();
  const penerbit: PenerbitAcaraDomainFirestore = buatPenerbitAcaraDomain(firestore as never);
  assert.throws(() => penerbit.tulisDalamTransaksi(buatEventTanpaSesi(), {} as Transaction));
});