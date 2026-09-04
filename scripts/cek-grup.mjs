import { readFileSync } from "node:fs";
for (const l of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) { const k = l.slice(0, i).trim(); if (k && !(k in process.env)) process.env[k] = l.slice(i+1).trim(); }
}
import { buatBootstrapFirestore } from "../src/infrastructure/firebase/bootstrap.ts";
const { firestore } = buatBootstrapFirestore();
const snap = await firestore.collection("groups").get();
console.log("groups:", snap.size);
for (const d of snap.docs) {
  const v = d.data();
  console.log("DOC " + d.id + ":");
  console.log("  " + JSON.stringify(v));
}
const sess = await firestore.collection("case_sessions").limit(5).get();
console.log("sessions:", sess.size);
for (const d of sess.docs) console.log(d.id, JSON.stringify(d.data()).slice(0,300));
