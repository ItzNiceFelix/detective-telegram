import test from "node:test";
import assert from "node:assert/strict";

import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdPemain, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { buatAtauPerbaruiTeori } from "../../src/domain/services/teori.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";

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
    unlockedStatementIds: [],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    ...overrides,
  };
}

test("teori UNSUPPORTED tanpa discovered knowledge", () => {
  const hasil = buatAtauPerbaruiTeori(sesiDasar(), goldenCaseBible, "user-1", { culpritSuspectId: "S01" }, buatWaktuIso("2026-01-01T01:00:00.000Z"));
  assert.equal(hasil.teori.support, "UNSUPPORTED");
});

test("teori PROVEN setelah proof path lengkap", () => {
  const sesi = sesiDasar({ discoveredEvidenceIds: ["E04"], knownTimelineEventIds: ["T02"] });
  const hasil = buatAtauPerbaruiTeori(sesi, goldenCaseBible, "user-1", { culpritSuspectId: "S01" }, buatWaktuIso("2026-01-01T01:00:00.000Z"));
  assert.equal(hasil.teori.support, "PROVEN");
});

test("teori menolak update dari spectator", () => {
  const sesi = sesiDasar();
  assert.throws(() => buatAtauPerbaruiTeori(sesi, goldenCaseBible, "spectator-1", {}, buatWaktuIso("2026-01-01T01:00:00.000Z")));
});

test("teori shared — update kedua mempertahankan field yang tidak diubah", () => {
  const sesi = sesiDasar();
  const h1 = buatAtauPerbaruiTeori(sesi, goldenCaseBible, "user-1", { culpritSuspectId: "S01" }, buatWaktuIso("2026-01-01T01:00:00.000Z"));
  const h2 = buatAtauPerbaruiTeori(h1.sesi, goldenCaseBible, "user-1", { motiveId: "MOTIVE_INSURANCE_FRAUD" }, buatWaktuIso("2026-01-01T01:05:00.000Z"));
  assert.equal(h2.teori.culpritSuspectId, "S01");
  assert.equal(h2.teori.motiveId, "MOTIVE_INSURANCE_FRAUD");
  assert.equal(h2.teori.theoryId, h1.teori.theoryId, "theoryId stabil — single shared theory");
});