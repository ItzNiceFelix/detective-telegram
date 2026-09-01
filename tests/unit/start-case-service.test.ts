import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { KesalahanValidasi } from "../../src/fondasi/eror.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { StatusVersiKasus, buatVersiKasus } from "../../src/kasus/versi-kasus.js";
import { MulaiSesiKasusLayanan, buatLayananMulaiSesiKasus } from "../../src/application/services/mulai-sesi-kasus.js";

test("mulai sesi kasus membuat session LOBBY lalu OPEN dan mengirim event", async () => {
  const caseVersion = buatVersiKasus({
    caseId: buatIdKasus("case-001"),
    versionId: buatIdVersiKasus("v-1"),
    schemaVersion: 1,
    metadata: {
      title: "Kasus A",
      premise: "Premis A",
      genre: "MISTERI",
      tags: ["misteri"],
      starRating: 4,
    },
    caseBibleRef: "case-bible:case-001:main",
    assetManifestRef: "assets:case-001:v-1:manifest",
    contentSummary: "Ringkasan case",
    status: StatusVersiKasus.PUBLISHED,
    publishedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
  });

  const storedSessions: Record<string, any> = {};
  const events: any[] = [];

  const layanan = new MulaiSesiKasusLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => caseVersion,
    },
    repositoriSesiKasus: {
      ambil: async (sessionId) => storedSessions[String(sessionId)] ?? null,
      simpan: async (sesi) => {
        storedSessions[String(sesi.sessionId)] = sesi;
        return sesi;
      },
      transaksi: async (runner) => runner({} as any),
    },
    repositoriGrup: {
      ambil: async () => ({
        groupId: buatIdGrup("group-1"),
        telegramChatId: "-1001",
        createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE" as const,
      }),
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: {
      kirim: async (event) => {
        events.push(event);
      },
    },
    kontrakIdempoten: {
      ambilKunci: async () => null,
      simpanKunci: async () => undefined,
    },
    waktu: {
      sekarangIso: () => buatWaktuIso("2026-01-02T00:00:00.000Z"),
    },
  });

  const hasil = await layanan.mulaiSesiKasus({
    idUpdateTelegram: "update-1",
    caseId: buatIdKasus("case-001"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("group-1"),
    userId: buatIdPemain("user-1"),
    sourceActionId: "start-case-1",
  });

  assert.equal(hasil.status, "berhasil");
  assert.equal(hasil.data.status, StatusSesi.OPEN);
  assert.equal(hasil.data.playerIds[0], "user-1");
  assert.equal(events.length, 1);
});

test("mulai sesi kasus memanfaatkan transaction yang sama untuk read/write sesi dan idempotency", async () => {
  const caseVersion = buatVersiKasus({
    caseId: buatIdKasus("case-003"),
    versionId: buatIdVersiKasus("v-1"),
    schemaVersion: 1,
    metadata: {
      title: "Kasus C",
      premise: "Premis C",
      genre: "MISTERI",
      tags: ["misteri"],
      starRating: 4,
    },
    caseBibleRef: "case-bible:case-003:main",
    assetManifestRef: "assets:case-003:v-1:manifest",
    contentSummary: "Ringkasan case",
    status: StatusVersiKasus.PUBLISHED,
    publishedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
  });

  const transaksiDipakai: Array<string> = [];
  const layanan = new MulaiSesiKasusLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => caseVersion,
    },
    repositoriSesiKasus: {
      ambil: async (sessionId, transaction) => {
        const tx = transaction as any;
        transaksiDipakai.push(`session-read:${String(tx?.id ?? "no-transaction")}`);
        return null;
      },
      simpan: async (sesi, transaction) => {
        const tx = transaction as any;
        transaksiDipakai.push(`session-write:${String(tx?.id ?? "no-transaction")}`);
        return sesi;
      },
      transaksi: async (runner) => runner({ id: "tx-atomic-1" } as any),
    },
    repositoriGrup: {
      ambil: async () => ({
        groupId: buatIdGrup("group-3"),
        telegramChatId: "-1003",
        createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE" as const,
      }),
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: {
      kirim: async () => undefined,
    },
    kontrakIdempoten: {
      ambilKunci: async (_actionId, _sessionId, transaction) => {
        const tx = transaction as any;
        transaksiDipakai.push(`idempotency-read:${String(tx?.id ?? "no-transaction")}`);
        return null;
      },
      simpanKunci: async (_metadata, transaction) => {
        const tx = transaction as any;
        transaksiDipakai.push(`idempotency-write:${String(tx?.id ?? "no-transaction")}`);
      },
    },
    waktu: {
      sekarangIso: () => buatWaktuIso("2026-01-02T00:00:00.000Z"),
    },
  });

  await layanan.mulaiSesiKasus({
    idUpdateTelegram: "update-3",
    caseId: buatIdKasus("case-003"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("group-3"),
    userId: buatIdPemain("user-3"),
    sourceActionId: "start-case-3",
  });

  assert.deepEqual(transaksiDipakai, [
    "session-read:tx-atomic-1",
    "idempotency-read:tx-atomic-1",
    "session-write:tx-atomic-1",
    "idempotency-write:tx-atomic-1",
  ]);
});

test("mulai sesi kasus menolak case version belum publish", async () => {
  const draft = buatVersiKasus({
    caseId: buatIdKasus("case-002"),
    versionId: buatIdVersiKasus("v-1"),
    schemaVersion: 1,
    metadata: {
      title: "Kasus B",
      premise: "Premis B",
      genre: "MISTERI",
      tags: ["misteri"],
      starRating: 5,
    },
    caseBibleRef: "case-bible:case-002:main",
    assetManifestRef: "assets:case-002:v-1:manifest",
    contentSummary: "Draft",
    status: StatusVersiKasus.DRAFT,
  });

  const layanan = buatLayananMulaiSesiKasus({
    repositoriVersiKasus: { ambilVersiKasus: async () => draft },
    repositoriSesiKasus: {
      ambil: async () => null,
      simpan: async (sesi) => sesi,
      transaksi: async (runner) => runner({} as any),
    },
    repositoriGrup: {
      ambil: async () => ({
        groupId: buatIdGrup("group-2"),
        telegramChatId: "-2001",
        createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
      }),
      simpan: async (grup) => grup,
    },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: { ambilKunci: async () => null, simpanKunci: async () => undefined },
    waktu: { sekarangIso: () => buatWaktuIso("2026-01-02T00:00:00.000Z") },
  });

  const hasil = await layanan.mulaiSesiKasus({
    idUpdateTelegram: "update-2",
    caseId: buatIdKasus("case-002"),
    caseVersionId: buatIdVersiKasus("v-1"),
    groupId: buatIdGrup("group-2"),
    userId: buatIdPemain("user-2"),
    sourceActionId: "start-case-2",
  });

  assert.equal(hasil.status, "gagal");
  assert.ok(hasil.error instanceof KesalahanValidasi);
});
