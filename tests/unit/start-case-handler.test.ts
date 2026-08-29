import test from "node:test";
import assert from "node:assert/strict";

import { StartCaseTelegramHandler } from "../../src/infrastructure/adapters/telegram/start-case-handler.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdVersiKasus } from "../../src/fondasi/primitif.js";
import { berhasil } from "../../src/fondasi/hasil.js";

const layananDummy = {
  mulaiSesiKasus: async () => berhasil({
    sessionId: "session-123" as any,
    status: "OPEN" as any,
    playerIds: ["user-1"] as any,
  } as any),
} as any;

test("handler telegram memetakan hasil application ke response aman", async () => {
  const handler = new StartCaseTelegramHandler(layananDummy);

  const hasil = await handler.prosesPermintaan({
    updateId: "upd-1",
    userId: buatIdPemain("user-1"),
    groupId: buatIdGrup("group-1"),
    caseId: buatIdKasus("case-001"),
    caseVersionId: buatIdVersiKasus("v-1"),
    actionId: "start-case-1",
  });

  assert.equal(hasil.status, "berhasil");
  assert.equal(hasil.data.sessionId, "session-123");

  const response = handler.renderResponse(hasil);
  assert.match(response.text, /Sesi kasus sudah dimulai/i);
});
