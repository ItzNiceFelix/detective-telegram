import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { LayananInvestigasiKasus } from "../../src/application/services/investigasi-kasus.js";
import { RepositoriCaseBibleStatis } from "../../src/kasus/case-bible-repository.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

function buatLayanan(sesiAwal: SesiKasus) {
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

function sesiDasar(overrides: Partial<SesiKasus> = {}): SesiKasus {
  return {
    sessionId: "session-1" as any,
    caseId: "CASE-001" as any,
    caseVersionId: "v-1" as any,
    groupId: "group-1" as any,
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1")],
    discoveredEvidenceIds: [],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("prosesInvestigasiAdegan menolak spectator (bukan playerIds)", async () => {
  const { layanan } = buatLayanan(sesiDasar());
  const hasil = await layanan.prosesInvestigasiAdegan({
    sessionId: "session-1" as any,
    userId: buatIdPemain("spectator-1"),
    sceneId: "ROOM_407",
  });

  assert.equal(hasil.status, "gagal");
});

test("prosesPeriksaObjek berhasil dan mengirim event EVIDENCE_DISCOVERED", async () => {
  const { layanan, events } = buatLayanan(sesiDasar());

  const hasil = await layanan.prosesPeriksaObjek({
    sessionId: "session-1" as any,
    userId: buatIdPemain("user-1"),
    objectId: "OBJ_WATCH",
  });

  assert.equal(hasil.status, "berhasil");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "EVIDENCE_DISCOVERED");
  assert.equal(events[0].payload.evidenceId, "E01");
  assert.equal(events[0].payload.discoveredBy, "user-1");
});

test("prosesPeriksaObjek duplicate tidak mengirim event kedua", async () => {
  const { layanan, events } = buatLayanan(sesiDasar());

  await layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), objectId: "OBJ_WATCH" });
  await layanan.prosesPeriksaObjek({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), objectId: "OBJ_WATCH" });

  assert.equal(events.length, 1, "hanya satu event EVIDENCE_DISCOVERED meski dipanggil dua kali");
});

test("prosesPeriksaObjek menolak jika sesi bukan OPEN", async () => {
  const { layanan } = buatLayanan(sesiDasar({ status: StatusSesi.LOBBY }));

  const hasil = await layanan.prosesPeriksaObjek({
    sessionId: "session-1" as any,
    userId: buatIdPemain("user-1"),
    objectId: "OBJ_WATCH",
  });

  assert.equal(hasil.status, "gagal");
});