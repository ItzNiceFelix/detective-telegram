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

  // Serialisasi manual `transaksi`, menyerupai retry/commit Firestore: panggilan
  // berikutnya menunggu panggilan sebelumnya selesai commit sehingga membaca
  // state terkini. Tanpa ini, runner bersamaan melihat snapshot yang sama dan
  // lapisan idempotency domain tidak dapat diverifikasi (lost-update duplikat).
  let antreanTransaksi: Promise<unknown> = Promise.resolve();

  const layanan = new LayananInterogasiKasus({
    repositoriSesi: {
      ambil: async (id) => store[String(id)] ?? null,
      simpan: async (sesi) => {
        store[String(sesi.sessionId)] = sesi;
        return sesi;
      },
      transaksi: async (runner) => {
        const jalankan = async () => runner({} as any);
        const berikutnya = antreanTransaksi.then(jalankan, jalankan);
        antreanTransaksi = berikutnya.then(() => undefined, () => undefined);
        return berikutnya;
      },
    },
    repositoriCaseBible: new RepositoriCaseBibleStatis([{ ...goldenCaseBible, caseBibleRef: "case-bible:CASE-001:golden" }]),
    penerbitEventDomain: { kirim: async (e) => { events.push(e); } },
    waktu: { sekarangIso: () => buatWaktuIso("2026-01-01T02:00:00.000Z") },
    renderer: new RendererNaratifDeterministik(),
  });

  return { layanan, store, events };
}

test("dua detective interogasi node yang sama 'bersamaan' — hanya satu unlock", async () => {
  const sesi: SesiKasus = {
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
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
  };

  const { layanan, events, store } = buatLayanan(sesi);

  const [hasil1, hasil2] = await Promise.all([
    layanan.prosesInterogasi({ sessionId: "session-1" as any, userId: buatIdPemain("user-1"), suspectId: "S01", maksud: "ASK_ALIBI" }),
    layanan.prosesInterogasi({ sessionId: "session-1" as any, userId: buatIdPemain("user-2"), suspectId: "S01", maksud: "ASK_ALIBI" }),
  ]);

  assert.equal(hasil1.status, "berhasil");
  assert.equal(hasil2.status, "berhasil");
  assert.equal(events.filter((e) => e.type === "STATEMENT_UNLOCKED").length, 1);
  assert.deepEqual(store["session-1"]?.unlockedStatementIds, ["ST01"]);
});

test("dua detective confront evidence yang sama 'bersamaan' — hanya satu kontradiksi", async () => {
  const sesi: SesiKasus = {
    sessionId: "session-2" as any,
    caseId: "CASE-001" as any,
    caseVersionId: "v-1" as any,
    groupId: "group-1" as any,
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("user-1"), buatIdPemain("user-2")],
    discoveredEvidenceIds: ["E04"],
    examinedObjectIds: [],
    unlockedDialogueIds: [],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    unlockedStatementIds: ["ST01"],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
  };

  const { layanan, events, store } = buatLayanan(sesi);

  await Promise.all([
    layanan.prosesKonfrontasi({ sessionId: "session-2" as any, userId: buatIdPemain("user-1"), suspectId: "S01", evidenceId: "E04" }),
    layanan.prosesKonfrontasi({ sessionId: "session-2" as any, userId: buatIdPemain("user-2"), suspectId: "S01", evidenceId: "E04" }),
  ]);

  assert.equal(events.filter((e) => e.type === "CONTRADICTION_FOUND").length, 1);
  assert.deepEqual(store["session-2"]?.discoveredContradictionIds, ["CONTRA_01"]);
});