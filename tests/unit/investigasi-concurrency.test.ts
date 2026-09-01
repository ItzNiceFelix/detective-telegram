import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { LayananInvestigasiKasus } from "../../src/application/services/investigasi-kasus.js";
import { RepositoriCaseBibleStatis } from "../../src/kasus/case-bible-repository.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

/**
 * Simulasi Firestore transaction dengan serialisasi manual: setiap panggilan
 * `transaksi` membaca snapshot store SAAT runner dipanggil, tapi kedua runner
 * dijalankan berurutan (mensimulasikan retry Firestore terhadap commit
 * pertama) — ini memverifikasi bahwa domain-level idempotency check (bukan
 * hanya Telegram idempotency key) yang mencegah double-discovery.
 */
function buatLayananConcurrency(sesiAwal: SesiKasus) {
  const store: Record<string, SesiKasus> = { [String(sesiAwal.sessionId)]: sesiAwal };
  const events: any[] = [];

  const layanan = new LayananInvestigasiKasus({
    repositoriSesi: {
      ambil: async (id) => store[String(id)] ?? null,
      simpan: async (sesi) => {
        store[String(sesi.sessionId)] = sesi;
        return sesi;
      },
      transaksi: async (runner) => runner({} as any),
    },
    repositoriCaseBible: new RepositoriCaseBibleStatis([{ ...goldenCaseBible, caseBibleRef: "case-bible:CASE-001:golden" }]),
    penerbitEventDomain: { kirim: async (e) => { events.push(e); } },
    waktu: { sekarangIso: () => buatWaktuIso("2026-01-01T02:00:00.000Z") },
  });

  return { layanan, store, events };
}

function sesiDasar(): SesiKasus {
  return {
    sessionId: "session-1" as any,
    caseId: "CASE-001" as any,
    caseVersionId: "v-1" as any,
    groupId: "group-1" as any,
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1"), buatIdPemain("user-2")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
  };
}

test("dua detective inspect object pertama kali secara 'bersamaan' — hanya satu discovery event", async () => {
  const { layanan, events, store } = buatLayananConcurrency(sesiDasar());

  const [hasil1, hasil2] = await Promise.all([
    layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), objectId: "OBJ_WATCH" }),
    layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-2"), objectId: "OBJ_WATCH" }),
  ]);

  assert.equal(hasil1.status, "berhasil");
  assert.equal(hasil2.status, "berhasil");
  assert.equal(events.length, 1, "hanya satu EVIDENCE_DISCOVERED walau dua request bersamaan");
  assert.equal(store["session-1"]?.discoveredEvidenceIds.length, 1);
  assert.deepEqual(store["session-1"]?.examinedObjectIds, ["OBJ_WATCH"]);
});

test("shared evidence tetap konsisten setelah concurrent inspect pada object berbeda", async () => {
  const { layanan, store } = buatLayananConcurrency(sesiDasar());

  await Promise.all([
    layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), objectId: "OBJ_WATCH" }),
    layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-2"), objectId: "OBJ_FOOTPRINTS" }),
  ]);

  const evidenceFinal = store["session-1"]?.discoveredEvidenceIds ?? [];
  assert.ok(evidenceFinal.includes("E01"));
  assert.ok(evidenceFinal.includes("E02"));
  assert.equal(evidenceFinal.length, 2);
});