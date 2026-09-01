import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { LayananInterogasiKasus } from "../../src/application/services/interogasi-kasus.js";
import { RepositoriCaseBibleStatis } from "../../src/kasus/case-bible-repository.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import { RendererNaratifDeterministik } from "../../src/domain/services/renderer-naratif.js";
import type { SesiKasus } from "../../src/domain/entities.js";

function buatLayanan(sesiAwal: SesiKasus) {
  const store: Record<string, SesiKasus> = { [String(sesiAwal.sessionId)]: sesiAwal };
  const events: any[] = [];

  const layanan = new LayananInterogasiKasus({
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
    renderer: new RendererNaratifDeterministik(),
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
    discoveredEvidenceIds: ["E04"],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    ...overrides,
  };
}

test("prosesInterogasi menolak spectator", async () => {
  const { layanan } = buatLayanan(sesiDasar());
  const hasil = await layanan.prosesInterogasi({
    sessionId: "session-1" as any,
    userId: buatIdPemain("spectator-1"),
    suspectId: "S01",
    maksud: "ASK_ALIBI",
  });
  assert.equal(hasil.status, "gagal");
});

test("prosesInterogasi ASK_ALIBI mengirim event STATEMENT_UNLOCKED", async () => {
  const { layanan, events } = buatLayanan(sesiDasar());
  const hasil = await layanan.prosesInterogasi({
    sessionId: "session-1" as any,
    userId: buatIdPemain("user-1"),
    suspectId: "S01",
    maksud: "ASK_ALIBI",
  });

  assert.equal(hasil.status, "berhasil");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "STATEMENT_UNLOCKED");
});

test("prosesKonfrontasi menghasilkan CONFRONTATION_SUCCESS + CONTRADICTION_FOUND + TIMELINE_KNOWLEDGE_GAINED", async () => {
  const { layanan, events } = buatLayanan(sesiDasar({ unlockedStatementIds: ["ST01"] }));

  const hasil = await layanan.prosesKonfrontasi({
    sessionId: "session-1" as any,
    userId: buatIdPemain("user-1"),
    suspectId: "S01",
    evidenceId: "E04",
  });

  assert.equal(hasil.status, "berhasil");
  const tipeEvent = events.map((e) => e.type).sort();
  assert.deepEqual(tipeEvent, ["CONFRONTATION_SUCCESS", "CONTRADICTION_FOUND", "TIMELINE_KNOWLEDGE_GAINED"].sort());
});

test("prosesKonfrontasi duplicate tidak mengirim event kedua", async () => {
  const { layanan, events } = buatLayanan(sesiDasar({ unlockedStatementIds: ["ST01"] }));

  await layanan.prosesKonfrontasi({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), suspectId: "S01", evidenceId: "E04" });
  await layanan.prosesKonfrontasi({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), suspectId: "S01", evidenceId: "E04" });

  assert.equal(events.length, 3, "hanya set event pertama, tidak digandakan pada panggilan kedua");
});