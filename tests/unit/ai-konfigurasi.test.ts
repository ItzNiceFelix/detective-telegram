import test from "node:test";
import assert from "node:assert/strict";
import { bacaKonfigurasiAi } from "../../src/ai/konfigurasi.js";

test("konfigurasi AI: gemini tanpa API key → caseGenerationEnabled=false, textReady=false, imageReady=false", () => {
  const cfg = bacaKonfigurasiAi({
    AI_PROVIDER: "gemini",
    AI_CASE_GENERATION_ENABLED: "true",
    AI_TEXT_MODEL: "gemini-flash-latest",
    AI_IMAGE_MODEL: "gemini-3.1-flash-image",
  });
  assert.equal(cfg.provider, "gemini");
  // Honesty fix: kunci tidak valid ⇒ teks tidak siap ⇒ case generation dipaksa false.
  assert.equal(cfg.textReady, false);
  assert.equal(cfg.imageReady, false);
  assert.equal(cfg.caseGenerationEnabled, false);
});

test("konfigurasi AI: gemini dengan API key → caseGenerationEnabled=true (admin/offline), textReady=true", () => {
  const cfg = bacaKonfigurasiAi({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "kunci-hanya-untuk-tes" });
  assert.equal(cfg.textReady, true);
  assert.equal(cfg.caseGenerationEnabled, true);
});