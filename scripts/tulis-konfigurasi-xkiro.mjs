import { readFileSync } from "node:fs";
import { buatBootstrapFirestore } from "../src/infrastructure/firebase/bootstrap.ts";

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
} catch { /* .env opsional */ }

async function main() {
  const { firestore } = buatBootstrapFirestore();
  const doc = firestore.collection("ai_runtime_config").doc("production");
  const sekarang = new Date().toISOString();

  const payload = {
    text: {
      enabled: true,
      provider: "xkiro",
      model: "qwen/qwen3.5-flash:free",
      dialogueModel: "mistralai/ministral-3b",
      hintModel: "mistralai/ministral-3b",
      fallback: { provider: "xkiro", model: "mistralai/ministral-3b" },
      baseUrl: "https://api.xkiro.com/v1",
      maxInputTokens: 8192,
      maxOutputTokens: 2400,
      maxRetries: 1,
      timeoutMs: 60000,
    },
    runtimeNarrative: { enabled: true },
    assistant: { enabled: true },
    image: { enabled: false, mode: "HUMAN_IN_LOOP" },
    caseGeneration: { enabled: true },
    updatedAt: sekarang,
    updatedBy: "ops-lock-qwen-ministral",
  };

  const sebelum = await doc.get();
  console.log("PRIOR_CONFIG:" + (sebelum.exists ? Object.keys(sebelum.data() ?? {}).join(",") : "(none)"));

  await doc.set(payload, { merge: true });
  const hasil = await doc.get();
  console.log("WRITTEN:" + JSON.stringify(hasil.data(), null, 2));
  console.log("EXISTS=" + hasil.exists);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("GAGAL menulis konfigurasi:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
