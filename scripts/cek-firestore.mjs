/**
 * scripts/cek-firestore.mjs
 * Quick check: case_versions + asset_tasks collections
 * Run: node scripts/cek-firestore.mjs
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ?.replace(/\\n/g, "\n")
  .trim();

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});

const db = getFirestore();

async function main() {
  console.log("=== case_versions ===");
  const versiSnap = await db.collection("case_versions").get();
  if (versiSnap.empty) {
    console.log("(kosong)");
  } else {
    versiSnap.forEach((doc) => {
      const d = doc.data();
      console.log(`  ${doc.id} → status=${d.status}, title=${d.metadata?.title ?? "(tanpa judul)"}`);
    });
  }

  console.log("\n=== asset_tasks ===");
  const tugasSnap = await db.collection("asset_tasks").get();
  if (tugasSnap.empty) {
    console.log("(kosong)");
  } else {
    tugasSnap.forEach((doc) => {
      const d = doc.data();
      console.log(`  ${doc.id} → status=${d.status}, caseId=${d.caseId}, sceneId=${d.sceneId}`);
    });
  }

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
