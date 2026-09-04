import test from "node:test";
import assert from "node:assert/strict";

import { buatDataCallback, uraiDataCallback } from "../../src/telegram/kontrak-callback.js";

test("roundtrip buat → urai untuk semua aksi berargumen", () => {
  const kasus: Array<[string, string[]]> = [
    ["join", []],
    ["hud", []],
    ["investigate", ["ROOM_407"]],
    ["inspect", ["OBJ_1"]],
    ["suspects", []],
    ["suspect", ["S01"]],
    ["interrogate", ["S01"]],
    ["interrogate_maksud", ["S01", "ASK_ALIBI"]],
    ["confront", ["S01"]],
    ["confront_evidence", ["S01", "E01"]],
    ["timeline", []],
    ["contradictions", []],
    ["theory", ["S01"]],
    ["accuse", ["S01"]],
    ["vote", []],
    ["finalize", []],
    ["confirm_finalize", []],
    ["back", ["hud"]],
  ];
  for (const [aksi, args] of kasus) {
    const data = buatDataCallback(aksi as never, ...args);
    assert.ok(data.length <= 64, `callback data bounded 64: ${data}`);
    const urai = uraiDataCallback(data);
    assert.ok(urai, `terurai: ${data}`);
    assert.equal(urai?.aksi, aksi);
    assert.deepEqual(urai?.args, args);
  }
});

test("data tak dikenal → null (versi salah, aksi salah, kosong, kepanjangan, spasi)", () => {
  assert.equal(uraiDataCallback(""), null);
  assert.equal(uraiDataCallback("v0:join"), null);
  assert.equal(uraiDataCallback("v1:hack"), null);
  assert.equal(uraiDataCallback("v1"), null);
  assert.equal(uraiDataCallback("v1:inspect:" + "x".repeat(70)), null);
  assert.equal(uraiDataCallback("v1:inspect:ada spasi"), null);
  assert.equal(uraiDataCallback("v1:inspect:"), null);
});

test("batas 64 char ditegakkan", () => {
  const data = buatDataCallback("inspect", "OBJ_" + "X".repeat(60));
  assert.ok(data.length > 64);
  assert.equal(uraiDataCallback(data), null);
});
