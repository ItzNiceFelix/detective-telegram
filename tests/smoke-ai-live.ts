#!/usr/bin/env node
/** AI LIVE + STORAGE SMOKE — real credentials (storage=TELEGRAM_BETA).
 * Prosedur: docs/AI-LIVE-SMOKE-RESULT.md (disarikan ke storage beta).
 * Batas: tepat 1 text + 1 image (dedup memastikan provider gambar tak dipanggil 2x).
 * Kejujuran: file_id Telegram = BEST_EFFORT (bukan gs:// durable); read-back hanya
 * cek referensi tersimpan + ada()=true, BUKAN read-back byte object. Langkah 8-14
 * (generateCase/publish/sesi/replay) butuh text generation kedua (kandidat kasus)
 * yang melampaui batas "satu text" smoke awal → TIDAK dijalankan di sini.
 * HTTP status/latensi via fetch wrapper nyata; token/URL TIDAK dicetak.
 * Jalankan: npx tsx tests/smoke-ai-live.ts
 */
import { readFileSync } from "node:fs";
import { GeminiTextProvider } from "../src/infrastructure/adapters/ai/gemini-text.js";
import { GeminiImageProvider } from "../src/infrastructure/adapters/ai/gemini-image.js";
import { TelegramAdapter } from "../src/infrastructure/adapters/telegram/telegram.js";
import { PenyimpananAsetTelegram } from "../src/infrastructure/adapters/storage/penyimpanan-aset-telegram.js";
import { buatKomposisiAplikasi } from "../src/komposisi/komposisi-aplikasi.js";
import { hasilkanAsetGambar, simpanReferensiAset, type VisualPlan } from "../src/ai/visual-pipeline.js";
import type { KontrakPenyediaGambar } from "../src/ai/visual-pipeline.js";
import type { PermintaanAi } from "../src/ai/contracts.js";

// Muat .env ke process.env (TANPA mencetak secret).
(function muatEnvFile() {
  try {
    for (const baris of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const l = baris.trim();
      if (!l || l.startsWith("#")) continue;
      const eq = l.indexOf("=");
      if (eq <= 0) continue;
      const k = l.slice(0, eq).trim();
      const v = l.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch (error) {
    console.error("GAGAL: tidak dapat membaca .env:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

interface LangkahReport { nama: string; ok: boolean; bukti: string[]; }
const laporan: LangkahReport[] = [];
function catat(nama: string, bukti: string[], ok = true) {
  laporan.push({ nama, ok, bukti });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${nama}`);
  for (const b of bukti) console.log(`  • ${b}`);
}
function muat(k: string): string {
  const v = (process.env as Record<string, string | undefined>)[k];
  return v === undefined ? "" : v.trim();
}
function isi(k: string): boolean { return muat(k).length > 0; }

function buatPencatatFetch() {
  const meta = { attempts: 0, lastStatus: -1, latencyMs: -1 };
  const pencatat = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    meta.attempts += 1;
    const t0 = Date.now();
    const res = await fetch(input, init);
    meta.latencyMs = Date.now() - t0;
    meta.lastStatus = res.status;
    return res;
  };
  return { meta, pencatat };
}

function buatPenyediaTerhitung(inner: KontrakPenyediaGambar, counter: { calls: number }): KontrakPenyediaGambar {
  return { generateImage: async (request: PermintaanAi) => { counter.calls += 1; return inner.generateImage(request); } };
}

function planVisual(planId: string, sceneId: string): VisualPlan {
  return {
    planId, sceneId, purpose: "CRIME_SCENE",
    requiredClues: [{ id: "BOOK", label: "book", entityId: "OBJ-BOOK", kind: "object" }],
    forbiddenClues: [], inspectableObjects: ["OBJ-BOOK"], styleConstraints: ["no text overlays"],
  };
}

async function main(): Promise<void> {
  console.log("🧪 AI LIVE + STORAGE SMOKE (real credentials, storage=TELEGRAM_BETA)");

  // ---- Langkah 1: Credential gate (status only, tanpa nilai). ----
  const gate: Array<[string, boolean]> = [
    ["AI_PROVIDER=gemini", muat("AI_PROVIDER") === "gemini"],
    ["GEMINI_API_KEY", isi("GEMINI_API_KEY")],
    ["AI_TEXT_MODEL", isi("AI_TEXT_MODEL")],
    ["AI_IMAGE_MODEL", isi("AI_IMAGE_MODEL")],
    ["TELEGRAM_BOT_TOKEN", isi("TELEGRAM_BOT_TOKEN")],
    ["TELEGRAM_ASSET_VAULT_CHAT_ID", isi("TELEGRAM_ASSET_VAULT_CHAT_ID")],
    ["ASSET_STORAGE_PROVIDER=TELEGRAM_BETA", muat("ASSET_STORAGE_PROVIDER") === "TELEGRAM_BETA"],
    ["FIREBASE_PROJECT_ID", isi("FIREBASE_PROJECT_ID")],
    ["FIREBASE_CLIENT_EMAIL", isi("FIREBASE_CLIENT_EMAIL")],
    ["FIREBASE_PRIVATE_KEY", isi("FIREBASE_PRIVATE_KEY")],
  ];
  catat("Langkah 1 — Credential gate (nilai tidak ditampilkan)",
    gate.map(([k, ok]) => `${ok ? "ok" : "MISSING/INVALID"}  ${k}`),
    gate.every(([, ok]) => ok));
  if (!gate.every(([, ok]) => ok)) throw new Error("Credential gate gagal — henti.");

  const komposisi = buatKomposisiAplikasi();
  const repoAset = komposisi.repositoriAsetVisual;
  const textModel = muat("AI_TEXT_MODEL");
  const imageModel = muat("AI_IMAGE_MODEL");
  const apiKey = muat("GEMINI_API_KEY");
  const vaultChatId = muat("TELEGRAM_ASSET_VAULT_CHAT_ID");

  // ---- Langkah 2: real Gemini TEXT request (tepat 1). ----
  {
    const fm = buatPencatatFetch();
    const proses = new GeminiTextProvider({ apiKey, model: textModel, fetchImpl: fm.pencatat });
    const resp = await proses.generateText({
      promptType: "hint",
      context: { message: "A detective greets a player. Say one non-sensitive greeting line." },
      maxTokens: 200,
    });
    catat("Langkah 2 — Real Gemini TEXT request (1 text)",
      [
        `provider=gemini · model=${textModel}`,
        `httpStatus=${fm.meta.lastStatus} (non-2xx → adapter throw)`,
        `latency=${fm.meta.latencyMs}ms`,
        `fetchAttempts=${fm.meta.attempts} → retry=${fm.meta.attempts - 1}`,
        `outputNonEmpty=${resp.output.length > 0} · outputLength=${resp.output.length}`,
      ],
      fm.meta.lastStatus >= 200 && fm.meta.lastStatus < 300 && resp.output.length > 0);
  }

  // ============ PART2: Langkah 3-7 ============
  const caseId = "LIVE-SMOKE-20260903";
  const sceneId = "S1";
  const planId = "P1";
  const kunciAset = repoAset.ambilKunci(planVisual(planId, sceneId), caseId);

  const fmg = buatPencatatFetch();
  const gambarInner = new GeminiImageProvider({ apiKey, model: imageModel, fetchImpl: fmg.pencatat });
  const gmem = buatPencatatFetch();
  const pengirimTg = new TelegramAdapter({ botToken: muat("TELEGRAM_BOT_TOKEN"), fetchImpl: gmem.pencatat });
  const penyimpanan = new PenyimpananAsetTelegram({ chatId: vaultChatId, telegram: pengirimTg });
  const counterGambar = { calls: 0 };
  const penyediaGambar = buatPenyediaTerhitung(gambarInner, counterGambar);

  let asetUri = "";

  // ---- Langkah 3+4: real Gemini IMAGE + real TELEGRAM_BETA upload + simpan Firestore. ----
  {
    const aset = await hasilkanAsetGambar(caseId, planVisual(planId, sceneId), penyediaGambar, repoAset, "gemini", penyimpanan);
    asetUri = aset.uri;
    catat("Langkah 3+4 — Real Gemini IMAGE + upload TELEGRAM_BETA (1 image)",
      [
        `provider=gemini · model=${imageModel}`,
        `geminiHttp=${fmg.meta.lastStatus} · latency=${fmg.meta.latencyMs}ms · retry=${fmg.meta.attempts - 1}`,
        `telegramHttp=${gmem.meta.lastStatus} · latency=${gmem.meta.latencyMs}ms`,
        `storageProvider=${penyimpanan.storageProvider} · durability=${penyimpanan.durability}`,
        `storageReferenceType=telegramFileId(BEST_EFFORT)`,
        `assetUriPrefix=${aset.uri.slice(0, 24)}…`,
        `assetBytes=${aset.sizeBytes} · format=${aset.format} · width=${aset.width ?? "-"} · height=${aset.height ?? "-"}`,
      ],
      fmg.meta.lastStatus >= 200 && gmem.meta.lastStatus >= 200 && aset.uri.length > 0);
  }

  // ---- Langkah 5: read-back referensi (BEST_EFFORT). ----
  {
    const baca = await repoAset.ambil(kunciAset);
    const ada = baca !== null && (await penyimpanan.ada(baca.uri));
    catat("Langkah 5 — Read-back referensi (file_id, BEST_EFFORT)",
      [
        `firestoreDocExists=${baca !== null}`,
        `ada(reference)=${ada} (best-effort; bukan read-back byte durable)`,
        `uriMatchesUploaded=${baca?.uri === asetUri}`,
      ],
      baca !== null && ada && baca.uri === asetUri);
  }

  // ---- Langkah 6: verify Firestore metadata/manifest. ----
  {
    const asetBaru = (await repoAset.ambil(kunciAset))!;
    await simpanReferensiAset(repoAset, caseId, asetBaru);
    const manifest = await repoAset.ambilManifest(caseId);
    const m1 = manifest?.assets.find((a) => a.planId === planId);
    catat("Langkah 6 — Verify Firestore metadata/manifest",
      [
        `manifestExists=${manifest !== null} · assets=${manifest?.assets.length ?? "-"}`,
        `manifestAsset.storageProvider=${m1?.storageProvider ?? "-"} · durability=${m1?.durability ?? "-"}`,
        `manifestAsset.uriNonEmpty=${Boolean(m1?.uri)} · referenceType=telegramFileId(BEST_EFFORT)`,
        `verifiedAtSet=${Boolean(m1?.verifiedAt)} · noBinaryField=${!("bytes" in (m1 ?? {}))}`,
      ],
      manifest !== null && m1 !== undefined && m1.storageProvider === "TELEGRAM_BETA" &&
      m1.durability === "BEST_EFFORT" && m1.uri.length > 0 && m1.verifiedAt !== undefined);
  }

  // ---- Langkah 7: dedup — identity sama → provider gambar TIDAK dipanggil lagi. ----
  {
    const sebelum = counterGambar.calls;
    const asetUlang = await hasilkanAsetGambar(caseId, planVisual(planId, sceneId), penyediaGambar, repoAset, "gemini", penyimpanan);
    catat("Langkah 7 — Dedup (identity caseId:sceneId:planId sama)",
      [
        `imageProviderCallsBefore=${sebelum} · after=${counterGambar.calls} → dipanggilLagi=${counterGambar.calls > sebelum}`,
        `uploadDipakaiUlang=${asetUlang.uri === asetUri} (tanpa sendPhoto kedua)`,
      ],
      counterGambar.calls === sebelum && asetUlang.uri === asetUri);
  }

  // ---- Ringkasan. ----
  const lulus = laporan.filter((l) => l.ok).length;
  const allOk = laporan.every((l) => l.ok);
  console.log("\n==================");
  console.log(`Ringkasan: ${lulus}/${laporan.length} langkah lulus`);
  console.log("Total AI calls: text=1, image=1 (provider gambar tidak dipanggil 2x saat dedup)");
  console.log(`Final verdict: LIVE_AI_SMOKE = ${allOk ? "PASS" : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("\n❌ FATAL — smoke gagal:", error instanceof Error ? error.message : String(error));
  console.error("LiveAI smoke berhenti sebelum selesai; root cause di atas; tidak ada source diubah.");
  process.exit(1);
});