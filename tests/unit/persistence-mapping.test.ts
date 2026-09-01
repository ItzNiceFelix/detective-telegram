import test from "node:test";
import assert from "node:assert/strict";

import { RepositoriPenggunaFirestore } from "../../src/infrastructure/repositories/firestore/repositori-pengguna.js";
import { RepositoriGrupFirestore } from "../../src/infrastructure/repositories/firestore/repositori-grup.js";
import { RepositoriSesiFirestore } from "../../src/infrastructure/repositories/firestore/repositori-sesi.js";
import { StatusSesi } from "../../src/domain/enums.js";
import type { Pengguna, Grup, SesiKasus } from "../../src/domain/entities.js";

const firebaseStub = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: false }),
      set: async () => undefined,
    }),
  }),
} as any;

const penggunaAwal: Pengguna = {
  userId: "user-1" as any,
  telegramUserId: "tg-user-1",
  usernameSnapshot: "detective-1",
  language: "id",
  createdAt: "2026-01-01T00:00:00.000Z" as any,
  lastActiveAt: "2026-01-02T00:00:00.000Z" as any,
};

const grupAwal: Grup = {
  groupId: "group-1" as any,
  telegramChatId: "-100123",
  createdAt: "2026-01-01T00:00:00.000Z" as any,
  status: "ACTIVE",
  activeCaseSessionId: "session-1" as any,
};

const sesiAwal: SesiKasus = {
  sessionId: "session-1" as any,
  caseId: "case-1" as any,
  caseVersionId: "v1" as any,
  groupId: "group-1" as any,
  status: StatusSesi.OPEN,
  outcome: null,
  playerIds: ["user-1", "user-2"] as any,
  currentSceneId: "scene-1",
  discoveredEvidenceIds: ["evidence-1"],
  examinedObjectIds: ["object-1"],
  unlockedDialogueIds: ["dialogue-1"],
  teamTheory: "teori awal",
  score: 150,
  startedAt: "2026-01-01T00:00:00.000Z" as any,
  updatedAt: "2026-01-03T00:00:00.000Z" as any,
  lastActivityAt: "2026-01-03T00:00:00.000Z" as any,
  solvedAt: undefined,
  unlockedStatementIds: [],
  discoveredContradictionIds: [],
  knownTimelineEventIds: [],
};

test("repositori pengguna memetakan field penting domain ke Firestore dan balik", async () => {
  const repositori = new RepositoriPenggunaFirestore(firebaseStub as any);
  const hasil = await repositori.simpan(penggunaAwal);

  assert.deepEqual(hasil, penggunaAwal);
  assert.equal(hasil.userId, "user-1");
  assert.equal(hasil.language, "id");
});

test("repositori grup memetakan field penting domain ke Firestore dan balik", async () => {
  const repositori = new RepositoriGrupFirestore(firebaseStub as any);
  const hasil = await repositori.simpan(grupAwal);

  assert.deepEqual(hasil, grupAwal);
  assert.equal(hasil.groupId, "group-1");
  assert.equal(hasil.status, "ACTIVE");
});

test("repositori sesi menyimpan array penting dan state runtime tanpa kehilangan field", async () => {
  const repositori = new RepositoriSesiFirestore(firebaseStub as any);
  const hasil = await repositori.simpan(sesiAwal);

  assert.deepEqual(hasil, sesiAwal);
  assert.equal(hasil.status, StatusSesi.OPEN);
  assert.equal(hasil.playerIds.length, 2);
  assert.deepEqual(hasil.discoveredEvidenceIds, ["evidence-1"]);
  assert.equal(hasil.teamTheory, "teori awal");
});
