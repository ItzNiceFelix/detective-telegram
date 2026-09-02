import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { FirestorePalsu } from "./fake-firestore.js";
import { buatFetchTelegramPalsu, buatVersiKasusEmasTerbitan } from "./fake-telegram.js";
import { buatKomposisiAplikasi, type KomposisiAplikasi } from "../../src/komposisi/komposisi-aplikasi.js";
import { WaktuFiktif } from "../../src/fondasi/waktu.js";
import { buatIdPemain, type IdPemain, type IdSesiKasus } from "../../src/fondasi/primitif.js";
import { RepositoriCaseBibleStatis } from "../../src/kasus/case-bible-repository.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import { RendererNaratifDeterministik } from "../../src/domain/services/renderer-naratif.js";
import { tambahDetektifKeSesi } from "../../src/domain/services/transisi-sesi.js";
import type { SnapshotPenyelesaian } from "../../src/domain/kontrak-resolusi.js";
import { LayananInvestigasiKasus } from "../../src/application/services/investigasi-kasus.js";
import { LayananInterogasiKasus } from "../../src/application/services/interogasi-kasus.js";
import { LayananResolusiKasus } from "../../src/application/services/resolusi-kasus.js";
import { RepositoriKontribusiFirestore } from "../../src/infrastructure/repositories/firestore/repositori-kontribusi.js";
import { RepositoriSnapshotResolusiFirestore } from "../../src/infrastructure/repositories/firestore/repositori-snapshot-resolusi.js";

export const CHAT_E2E = "-1001";
export const DETEKTIF_1 = "42";
export const DETEKTIF_2 = "43";
export const SPECTATOR = "44";

export interface KonteksE2E {
  firestore: FirestorePalsu;
  komposisi: KomposisiAplikasi;
  layananInvestigasi: LayananInvestigasiKasus;
  layananInterogasi: LayananInterogasiKasus;
  layananResolusi: LayananResolusiKasus;
  waktu: WaktuFiktif;
  sessionId: IdSesiKasus;
}

export function parseUpdateTelegram(komposisi: KomposisiAplikasi, updateId: number, teks: string, userId: number) {
  return komposisi.pengirimTelegram.parseUpdate({
    update_id: updateId,
    message: {
      message_id: updateId,
      text: teks,
      chat: { id: Number(CHAT_E2E), type: "group" },
      from: { id: userId, username: `user-${userId}` },
    },
  });
}

export async function beriSesiE2E(detektifTambahan: IdPemain[] = []): Promise<KonteksE2E> {
  const firestore = new FirestorePalsu();
  const telegram = buatFetchTelegramPalsu({
    [`${CHAT_E2E}:42`]: "administrator",
    [`${CHAT_E2E}:43`]: "member",
    [`${CHAT_E2E}:44`]: "member",
  });
  const waktu = new WaktuFiktif(new Date("2026-02-10T00:00:00.000Z"));

  const komposisi = buatKomposisiAplikasi({
    firestore: firestore as unknown as Firestore,
    pengirimTelegram: { botToken: "AUDIT-TOKEN", fetchImpl: telegram.fetchImpl },
    waktu,
  });

  // Seed published CaseVersion (Golden Case, tanpa AI).
  await komposisi.repositoriVersiKasus.simpanVersiKasus(buatVersiKasusEmasTerbitan());

  // Case Bible statis dengan ref yang cocok dengan caseId sesi ("CASE-001").
  const caseBibleRef = "case-bible:CASE-001:golden";
  const repositoriCaseBible = new RepositoriCaseBibleStatis([{ ...goldenCaseBible, caseBibleRef }]);

  // /newcase melalui production composition root.
  const hasilNewcase = await komposisi.layananKomando.prosesUpdate(
    parseUpdateTelegram(komposisi, 1001, "/newcase", Number(DETEKTIF_1)),
  );
  assert.equal(hasilNewcase.status, "berhasil", "audit /newcase harus berhasil");
  const sessionId = (hasilNewcase.status === "berhasil" ? hasilNewcase.data.session?.sessionId : undefined) as IdSesiKasus;
  assert.ok(sessionId);

  // Tambah detective tambahan via domain helper `tambahDetektifKeSesi`
  // (production /join belum di-wire — gap audit; helper adalah mekanisme join yang ada).
  if (detektifTambahan.length > 0) {
    const sesi = (await komposisi.repositoriSesiKasus.ambil(sessionId))!;
    let denganDetektif = sesi;
    for (const id of detektifTambahan) {
      denganDetektif = tambahDetektifKeSesi(denganDetektif, id, waktu.sekarangIso());
    }
    await komposisi.repositoriSesiKasus.simpan(denganDetektif);
  }

  // /startcase melalui production composition root.
  const hasilStart = await komposisi.layananKomando.prosesUpdate(
    parseUpdateTelegram(komposisi, 1002, "/startcase", Number(DETEKTIF_1)),
  );
  assert.equal(hasilStart.status, "berhasil", "audit /startcase harus berhasil");

  const layananInvestigasi = new LayananInvestigasiKasus({
    repositoriSesi: komposisi.repositoriSesiKasus,
    repositoriCaseBible,
    penerbitEventDomain: komposisi.penerbitEventDomain,
    waktu,
  });

  const layananInterogasi = new LayananInterogasiKasus({
    repositoriSesi: komposisi.repositoriSesiKasus,
    repositoriCaseBible,
    penerbitEventDomain: komposisi.penerbitEventDomain,
    waktu,
    renderer: new RendererNaratifDeterministik(),
  });

  const layananResolusi = new LayananResolusiKasus({
    repositoriSesi: komposisi.repositoriSesiKasus,
    repositoriCaseBible,
    repositoriKontribusi: new RepositoriKontribusiFirestore(komposisi.firestore),
    repositoriSnapshot: new RepositoriSnapshotResolusiFirestore(komposisi.firestore),
    penerbitEventDomain: komposisi.penerbitEventDomain,
    waktu,
  });

  return { firestore, komposisi, layananInvestigasi, layananInterogasi, layananResolusi, waktu, sessionId };
}

export async function ambilSesi(konteks: KonteksE2E) {
  return (await konteks.komposisi.repositoriSesiKasus.ambil(konteks.sessionId))!;
}

export async function eventAksi(konteks: KonteksE2E, tipe: string): Promise<Array<Record<string, unknown>>> {
  const semua = konteks.firestore.semuaDokumen(`case_sessions/${String(konteks.sessionId)}/events`);
  return semua.filter((e) => e.type === tipe);
}

/** Jalankan investigasi adegan via production service. */
export function selidiki(konteks: KonteksE2E, sceneId: string, userId = DETEKTIF_1) {
  return konteks.layananInvestigasi.prosesInvestigasiAdegan({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    sceneId,
  });
}

/** Periksa object via production service. */
export function periksa(konteks: KonteksE2E, objectId: string, userId = DETEKTIF_1) {
  return konteks.layananInvestigasi.prosesPeriksaObjek({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    objectId,
  });
}

/** Interogasi via production service. */
export function interogasi(konteks: KonteksE2E, maksud: string, userId = DETEKTIF_1, suspectId = "S01") {
  return konteks.layananInterogasi.prosesInterogasi({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    suspectId,
    maksud: maksud as never,
  });
}

/** Konfrontasi via production service. */
export function konfrontasi(konteks: KonteksE2E, evidenceId: string, userId = DETEKTIF_1, suspectId = "S01") {
  return konteks.layananInterogasi.prosesKonfrontasi({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    suspectId,
    evidenceId,
  });
}

/** Perbarui teori via production service. */
export function perbaruiTeori(
  konteks: KonteksE2E,
  data: { culpritSuspectId?: string; motiveId?: string | null; methodId?: string | null; timelineHypothesisEventIds?: string[]; evidenceRefs?: string[] },
  userId = DETEKTIF_1,
) {
  return konteks.layananResolusi.prosesPerbaruiTeori({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    ...data,
  });
}

/** Ajukan tuduhan via production service. */
export function ajukanTuduhan(konteks: KonteksE2E, suspectId: string, userId = DETEKTIF_1) {
  return konteks.layananResolusi.prosesAjukanTuduhan({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
    suspectId,
  });
}

export function voteTuduhan(konteks: KonteksE2E, userId: string) {
  return konteks.layananResolusi.prosesVoteTuduhan({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
  });
}

export function finalisasiTuduhan(konteks: KonteksE2E, userId = DETEKTIF_1) {
  return konteks.layananResolusi.prosesFinalisasiTuduhan({
    sessionId: konteks.sessionId,
    userId: buatIdPemain(userId),
  });
}

export function resolusiSnapshot(konteks: KonteksE2E): SnapshotPenyelesaian | undefined {
  return konteks.firestore.ambilDokumen(`case_sessions/${String(konteks.sessionId)}/resolution`, "snapshot") as SnapshotPenyelesaian | undefined;
}