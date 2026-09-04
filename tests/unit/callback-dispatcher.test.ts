import test from "node:test";
import assert from "node:assert/strict";

import { KomandoTelegramLayanan, type KonfigurasiKomandoTelegram } from "../../src/application/services/komando-telegram.js";
import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { StatusSesi } from "../../src/domain/enums.js";
import { buatIdGrup, buatIdKasus, buatIdPemain, buatIdVersiKasus, buatWaktuIso } from "../../src/fondasi/primitif.js";
import { goldenCaseBible } from "../../src/kasus/fixtures/golden-case.js";
import type { SesiKasus } from "../../src/domain/entities.js";
import { LayananInvestigasiKasus } from "../../src/domain/services/investigasi-kasus.js";
import { LayananInterogasiKasus } from "../../src/application/services/interogasi-kasus.js";
import { LayananResolusiKasus } from "../../src/application/services/resolusi-kasus.js";
import { RendererNaratifDeterministik } from "../../src/domain/services/renderer-naratif.js";

/**
 * M2 — dispatcher callback: tombol memakai application service yang SAMA,
 * actor = pengklik (dari `from`), hasil mutasi identik dengan command.
 */
const SESI_ID = "-1001:CASE-001:s-cb";

function sesiTerbuka(over: Record<string, unknown> = {}) {
  return {
    sessionId: SESI_ID,
    caseId: buatIdKasus("CASE-001"),
    caseVersionId: buatIdVersiKasus("V1"),
    groupId: buatIdGrup("-1001"),
    status: StatusSesi.OPEN,
    outcome: null,
    playerIds: [buatIdPemain("42"), buatIdPemain("43")],
    discoveredEvidenceIds: ["E01", "E02", "E03", "E04"],
    examinedObjectIds: ["OBJ_WATCH", "OBJ_FOOTPRINTS", "OBJ_WINDOW", "OBJ_CCTV"],
    unlockedDialogueIds: ["NODE_ALIBI_01"],
    teamTheory: null,
    score: 0,
    updatedAt: buatWaktuIso("2026-01-01T00:00:00.000Z"),
    unlockedStatementIds: ["ST01"],
    discoveredContradictionIds: [],
    knownTimelineEventIds: [],
    ...over,
  };
}

function buatLayanan(over: Partial<KonfigurasiKomandoTelegram> = {}) {
  const tersimpan: Record<string, unknown> = { [SESI_ID]: sesiTerbuka() };
  const dijawab: string[] = [];
  const disunting: Array<{ chat: string; msg: number; teks: string }> = [];
  const terkirimKibord: Array<{ teks: string; kibord: unknown }> = [];
  const repoSesi = {
    ambil: async (id: unknown) => (tersimpan[String(id)] ?? null) as unknown as SesiKasus | null,
    simpan: async (s: SesiKasus) => { tersimpan[String(s.sessionId)] = s; return s; },
    transaksi: async <T>(r: (tx: never) => Promise<T>) => r({} as never),
  };
  const repoBible = { ambilCaseBible: async () => goldenCaseBible };
  const penerbit = { kirim: async () => undefined };
  const waktu = { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") };
  const layanan = new KomandoTelegramLayanan({
    repositoriVersiKasus: {
      ambilVersiKasus: async () => null,
      ambilVersiKasusTerbitan: async () => null,
      simpanVersiKasus: async (v) => v,
    },
    repositoriSesiKasus: {
      ambil: async (id) => (tersimpan[String(id)] ?? null) as unknown as import("../../src/domain/entities.js").SesiKasus | null,
      simpan: async (s) => { tersimpan[String(s.sessionId)] = s; return s; },
      transaksi: async (r) => r({ id: "tx" } as never),
    },
    repositoriGrup: {
      ambil: async (g) => ({ groupId: g ?? buatIdGrup("-1001"), telegramChatId: "-1001", createdAt: buatWaktuIso("2026-01-01T00:00:00.000Z"), status: "ACTIVE" as const, activeCaseSessionId: SESI_ID as never }),
      simpan: async (g) => g,
    },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: { ambilKunci: async () => null, simpanKunci: async () => undefined },
    waktu: { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
    repositoriCaseBible: { ambilCaseBible: async () => goldenCaseBible },
    layananInvestigasi: new LayananInvestigasiKasus({ repositoriSesi: repoSesi, repositoriCaseBible: repoBible, penerbitEventDomain: penerbit, waktu }),
    layananInterogasi: new LayananInterogasiKasus({ repositoriSesi: repoSesi, repositoriCaseBible: repoBible, penerbitEventDomain: penerbit, waktu, renderer: new RendererNaratifDeterministik() }),
    layananResolusi: new LayananResolusiKasus({ repositoriSesi: repoSesi, repositoriCaseBible: repoBible, repositoriKontribusi: { ambilSemuaUntukSesi: async () => [], tambahJikaBaru: async () => true }, repositoriSnapshot: { simpan: async () => undefined }, penerbitEventDomain: penerbit, waktu }),
    pengirimInteraktif: {
      kirimPesanKibord: async (_c: string, teks: string, kibord: unknown) => { terkirimKibord.push({ teks, kibord }); return 9; },
      suntingPesanKibord: async (c: string, m: number, teks: string) => { disunting.push({ chat: c, msg: m, teks }); },
      jawabCallback: async (id: string, t?: string) => { dijawab.push(id + ":" + (t ?? "")); },
      sematkanPesan: async () => undefined,
      lucutiSematPesan: async () => undefined,
      padamPesan: async () => undefined,
    },
    ...over,
  } as KonfigurasiKomandoTelegram);
  return { layanan, tersimpan, dijawab, disunting, terkirimKibord };
}

const parser = new TelegramAdapter();

function callbackUpdate(updateId: number, userId: number, data: string, messageId = 50) {
  return parser.parseUpdate({
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      data,
      from: { id: userId, username: userId === 42 ? "felix" : "alice" },
      message: { message_id: messageId, chat: { id: -1001, type: "supergroup" } },
    },
  });
}

test("callback vote tanpa proposal: gagal aman tapi callback tetap di-answer", async () => {
  const { layanan, tersimpan, dijawab } = buatLayanan();
  const hasil = await layanan.prosesUpdate(callbackUpdate(701, 43, "v1:vote"));
  assert.equal(hasil.status, "gagal");
  const sesi = tersimpan[SESI_ID] as { accusationProposal?: { votes: string[] } | null };
  assert.ok(!sesi.accusationProposal, "tanpa proposal → tidak ada mutasi");
  assert.ok(dijawab.some((d) => d.startsWith("cb-701")), "callback harus di-answer walau gagal");
});

test("callback vote dengan proposal aktif: Alice vote tercatat sebagai Alice", async () => {
  const { layanan, tersimpan } = buatLayanan();
  (tersimpan[SESI_ID] as Record<string, unknown>).accusationProposal = {
    proposalId: "p-1", sessionId: SESI_ID, suspectId: "S01", proposerId: "42", votes: ["42"], status: "OPEN", createdAt: "2026-01-01T00:00:00.000Z",
  };
  const hasil = await layanan.prosesUpdate(callbackUpdate(702, 43, "v1:vote"));
  assert.equal(hasil.status, "berhasil");
  const sesi = tersimpan[SESI_ID] as { accusationProposal: { votes: string[]; status: string } };
  assert.deepEqual([...sesi.accusationProposal.votes].sort(), ["42", "43"]);
  assert.equal(sesi.accusationProposal.status, "QUALIFIED");
});

test("callback suspects: daftar suspect + edit pesan menu", async () => {
  const { layanan, disunting } = buatLayanan();
  const hasil = await layanan.prosesUpdate(callbackUpdate(703, 42, "v1:suspects"));
  assert.equal(hasil.status, "berhasil");
  assert.match(String(hasil.data.message), /Marcus Bell/);
  assert.ok(disunting.length === 1 && disunting[0]?.msg === 50, "menu suspects di-edit in-place");
});

test("callback investigate tanpa target: daftar adegan dari bible", async () => {
  const { layanan, terkirimKibord } = buatLayanan();
  const hasil = await layanan.prosesUpdate(callbackUpdate(704, 42, "v1:hud:investigate"));
  assert.equal(hasil.status, "berhasil");
  assert.ok(terkirimKibord.some((k) => k.teks.includes("INVESTIGATE")));
});

test("callback tak dikenal → jawab + tanpa mutasi", async () => {
  const { layanan, tersimpan, dijawab } = buatLayanan();
  const sebelum = JSON.stringify(tersimpan[SESI_ID]);
  const hasil = await layanan.prosesUpdate(callbackUpdate(705, 42, "v1:hack:x"));
  assert.equal(hasil.status, "berhasil");
  assert.equal(JSON.stringify(tersimpan[SESI_ID]), sebelum);
  assert.ok(dijawab.some((d) => d.startsWith("cb-705")));
});

test("callback tanpa sesi aktif → graceful (gagal tapi tidak crash)", async () => {
  const kosong = new KomandoTelegramLayanan({
    repositoriVersiKasus: {}, repositoriSesiKasus: { ambil: async () => null, simpan: async (s) => s, transaksi: async (r) => r({} as never) },
    repositoriGrup: { ambil: async () => null, simpan: async (g) => g },
    penerbitEventDomain: { kirim: async () => undefined },
    kontrakIdempoten: { ambilKunci: async () => null, simpanKunci: async () => undefined },
    waktu: { sekarangIso: () => buatWaktuIso("2026-02-01T00:00:00.000Z") },
    kirimPesanTelegram: async () => undefined,
    validasiAksesTelegram: async () => true,
    validasiGroupTelegram: async () => true,
  } as KonfigurasiKomandoTelegram);
  const hasil = await kosong.prosesUpdate(parser.parseUpdate({
    update_id: 706,
    callback_query: { id: "cb-706", data: "v1:timeline", from: { id: 42 }, message: { message_id: 1, chat: { id: -1001, type: "group" } } },
  }));
  assert.equal(hasil.status, "gagal");
});
