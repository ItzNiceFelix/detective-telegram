#!/usr/bin/env node

/**
 * PRODUCTION SMOKE (OFFLINE) — Detective Telegram
 *
 * Memvalidasi wiring produksi untuk 4 perintah inti:
 *   /start → /newcase → /status → /startcase
 *
 * Tanpa AI, tanpa jaringan nyata, tanpa endpoint baru:
 * - Firestore  : fake in-memory (semantik transaction sesuai SDK)
 * - Telegram   : fake fetch (sendMessage / getChatMember tercatat)
 * - Content    : published Golden Case fixture (src/kasus/fixtures/golden-case.ts)
 * - Composition: composition root asli (src/komposisi/komposisi-aplikasi.ts)
 *
 * Jalankan: npm run smoke
 */

import { buatKomposisiAplikasi, type KomposisiAplikasi } from "../src/komposisi/komposisi-aplikasi.js";
import type { Firestore } from "firebase-admin/firestore";
import { FirestorePalsu } from "./integration/fake-firestore.js";
import { buatFetchTelegramPalsu, buatVersiKasusEmasTerbitan } from "./integration/fake-telegram.js";
import { WaktuFiktif } from "../src/fondasi/waktu.js";
import { StatusSesi } from "../src/fondasi/../domain/enums.js";

interface HasilSmoke {
  nama: string;
  sukses: boolean;
  detail: string;
}

const hasil: HasilSmoke[] = [];
const CHAT = "-1001";

function catat(nama: string, fn: () => Promise<string>): Promise<void> {
  return fn()
    .then((detail) => {
      hasil.push({ nama, sukses: true, detail });
      console.log(`✅ ${nama} — ${detail}`);
    })
    .catch((error: unknown) => {
      hasil.push({ nama, sukses: false, detail: String(error) });
      console.log(`❌ ${nama} — ${error instanceof Error ? error.message : String(error)}`);
    });
}

function parseUpdate(komposisi: KomposisiAplikasi, payload: Record<string, unknown>) {
  return komposisi.pengirimTelegram.parseUpdate(payload);
}

async function main(): Promise<void> {
  console.log("🧪 Detective Telegram — Production Smoke (offline)\n");

  const firestore = new FirestorePalsu();
  const telegram = buatFetchTelegramPalsu({ [`${CHAT}:42`]: "administrator" });
  const komposisi = buatKomposisiAplikasi({
    firestore: firestore as unknown as Firestore,
    pengirimTelegram: { botToken: "SMOKE-TOKEN", fetchImpl: telegram.fetchImpl },
    waktu: new WaktuFiktif(new Date("2026-02-01T00:00:00.000Z")),
  });

  // Seed: published Golden Case (tanpa AI).
  await komposisi.repositoriVersiKasus.simpanVersiKasus(buatVersiKasusEmasTerbitan());

  const jalankan = (updateId: number, teks: string) =>
    komposisi.layananKomando.prosesUpdate(parseUpdate(komposisi, {
      update_id: updateId,
      message: { message_id: updateId, text: teks, chat: { id: Number(CHAT), type: "group" }, from: { id: 42, username: "detektif" } },
    }));

  let sesiAktifId = "";

  await catat("1. /start — outbound sendMessage + pendaftaran grup", async () => {
    const hasilStart = await jalankan(1, "/start");
    if (hasilStart.status !== "berhasil") throw new Error("/start gagal");
    const kirim = telegram.panggilan.find((p) => p.metode === "sendMessage");
    if (!kirim) throw new Error("/start tidak menghasilkan sendMessage");
    if (!firestore.ambilDokumen("groups", CHAT)) throw new Error("grup tidak terdaftar");
    return `grup ${CHAT} terdaftar, 1 outbound sendMessage`;
  });

  await catat("2. /newcase — sesi LOBBY + pointer + event atomic", async () => {
    const hasilNewcase = await jalankan(2, "/newcase");
    if (hasilNewcase.status !== "berhasil") throw new Error(`/newcase gagal: ${hasilNewcase.status === "gagal" ? hasilNewcase.error.message : ""}`);
    sesiAktifId = String(hasilNewcase.status === "berhasil" ? hasilNewcase.data.session?.sessionId : "");
    if (firestore.jumlahDokumen("case_sessions") !== 1) throw new Error("sesi != 1");
    if (!firestore.ambilDokumen(`case_sessions/${sesiAktifId}/events`, "evt-telegram:update:2-CASE_SESSION_CREATED")) {
      throw new Error("event CASE_SESSION_CREATED tidak ada");
    }
    return `sesi ${sesiAktifId} LOBBY, event tersimpan`;
  });

  await catat("3. /status — read-only, tanpa mutasi", async () => {
    const sebelum = firestore.jumlahDokumen("case_sessions");
    const hasilStatus = await jalankan(3, "/status");
    if (hasilStatus.status !== "berhasil") throw new Error("/status gagal");
    if (firestore.jumlahDokumen("case_sessions") !== sebelum) throw new Error("/status tidak boleh bermutasi");
    const sesi = firestore.ambilDokumen("case_sessions", sesiAktifId);
    if (sesi?.status !== StatusSesi.LOBBY) throw new Error(`status tak terduga: ${String(sesi?.status)}`);
    return `status: ${String(sesi?.status)} (read-only)`;
  });

  await catat("4. /startcase — LOBBY → OPEN + tepat satu CASE_STARTED", async () => {
    const hasilStartcase = await jalankan(4, "/startcase");
    if (hasilStartcase.status !== "berhasil") throw new Error("/startcase gagal");
    const events = firestore.semuaDokumen(`case_sessions/${sesiAktifId}/events`);
    const jumlahStarted = events.filter((e) => e.type === "CASE_STARTED").length;
    if (jumlahStarted !== 1) throw new Error(`CASE_STARTED = ${jumlahStarted}, harus 1`);
    const sesi = firestore.ambilDokumen("case_sessions", sesiAktifId);
    if (sesi?.status !== StatusSesi.OPEN) throw new Error(`status tak terduga: ${String(sesi?.status)}`);
    const ulang = await jalankan(4, "/startcase");
    if (ulang.status !== "berhasil") throw new Error("duplicate startcase harus safe replay");
    const eventsUlang = firestore.semuaDokumen(`case_sessions/${sesiAktifId}/events`).filter((e) => e.type === "CASE_STARTED");
    if (eventsUlang.length !== 1) throw new Error("duplicate membuat event kedua");
    return `sesi OPEN, idempotent terhadap duplicate`;
  });

  const lulus = hasil.filter((h) => h.sukses).length;
  console.log(`\n📊 Smoke: ${lulus}/${hasil.length} lulus`);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});