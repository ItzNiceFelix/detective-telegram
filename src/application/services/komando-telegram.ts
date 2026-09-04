import type { Transaction } from "firebase-admin/firestore";
import { StatusSesi, JenisKejadianDomain } from "../../domain/enums.js";
import type { Grup, SesiKasus } from "../../domain/entities.js";
import { validasiTransisiSesi, mulaiSesi, tambahDetektifKeSesi, BATAS_DETEKTIF_AKTIF } from "../../domain/services/transisi-sesi.js";
import type { KejadianDomain, KontrakIdempoten } from "../../event/domain.js";
import { validasiInputTelegram, amanUntukMutasiGame } from "../../security/audit.js";
import { KesalahanAutorisasi, KesalahanIdempoten, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import { buatIdEvent, buatIdGrup, buatIdKasus, buatIdSesiKasus, buatIdVersiKasus, type IdEvent, type IdGrup, type IdKasus, type IdPemain, type IdSesiKasus, type IdVersiKasus, type WaktuIso } from "../../fondasi/primitif.js";
import { StatusVersiKasus, publikasiVersiKasus, type VersiKasus } from "../../kasus/versi-kasus.js";
import type { PermintaanTelegram } from "../../infrastructure/adapters/telegram/telegram.js";
import type { KontrakRepositoriCaseBible } from "../../kasus/case-bible-repository.js";
import type { CaseBible, MaksudInterogasi, PeristiwaLinimasa } from "../../kasus/case-bible.js";
import type { LayananInvestigasiKasus } from "../../application/services/investigasi-kasus.js";
import type { LayananInterogasiKasus } from "../../application/services/interogasi-kasus.js";
import type { LayananResolusiKasus } from "../../application/services/resolusi-kasus.js";
import type { PintuRendererNaratif } from "../../domain/services/renderer-naratif.js";
import { renderDaftarObjek, renderHasilPeriksaObjek } from "./render-investigasi.js";
import type { BenihKasus, KandidatKasus, OpsiGenerasiKasus } from "../../kasus/generasi-kasus.js";
import type { ManifestAsetVisual, VisualPlan } from "../../ai/visual-pipeline.js";

export interface RepositoriVersiKasusTelegram {
  ambilVersiKasus?: (caseId?: IdKasus, versionId?: IdVersiKasus) => Promise<VersiKasus | null>;
  ambilVersiKasusTerbitan?: () => Promise<VersiKasus | null>;
  simpanVersiKasus?: (versi: VersiKasus) => Promise<VersiKasus>;
}

export interface RepositoriSesiKasusTelegram {
  ambil(sessionId: IdSesiKasus, transaction?: Transaction): Promise<SesiKasus | null>;
  simpan(sesi: SesiKasus, transaction?: Transaction): Promise<SesiKasus>;
  transaksi<T>(runner: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface RepositoriGrupTelegram {
  ambil(groupId: IdGrup, transaction?: Transaction): Promise<Grup | null>;
  simpan(grup: Grup, transaction?: Transaction): Promise<Grup>;
}

export interface PenerbitEventTelegram {
  kirim(event: KejadianDomain): Promise<void>;
  /** Persist event atomic dalam transaction yang sama dengan mutasi kanonik. */
  tulisDalamTransaksi?(event: KejadianDomain, transaction: Transaction): void;
}

export interface PenyediaWaktuTelegram {
  sekarangIso(): WaktuIso;
}

export interface LoggerKomandoTelegram {
  info?(pesan: string, konteks?: Record<string, unknown>): void;
  warn?(pesan: string, konteks?: Record<string, unknown>): void;
  error?(pesan: string, konteks?: Record<string, unknown>): void;
}

export interface KonfigurasiKomandoTelegram {
  repositoriVersiKasus: RepositoriVersiKasusTelegram;
  repositoriSesiKasus: RepositoriSesiKasusTelegram;
  repositoriGrup: RepositoriGrupTelegram;
  penerbitEventDomain: PenerbitEventTelegram;
  kontrakIdempoten: KontrakIdempoten;
  waktu: PenyediaWaktuTelegram;
  kirimPesanTelegram: (chatId: string, message: string, opsi?: { parseMode?: "Markdown" }) => Promise<void>;
  validasiAksesTelegram: (userId: string, groupId: string) => Promise<boolean>;
  validasiGroupTelegram: (chatId: string) => Promise<boolean>;
  /** /startcase: admin grup. Default fallback: validasiAksesTelegram. */
  validasiAdminGrup?: (userId: string, chatId: string) => Promise<boolean>;
  /** Sumber Case Bible untuk rendering (suspects/timeline) & lookup gameplay. */
  repositoriCaseBible?: KontrakRepositoriCaseBible;
  /** Layanan gameplay — dipakai oleh command /investigate, /inspect, dll. */
  layananInvestigasi?: LayananInvestigasiKasus;
  layananInterogasi?: LayananInterogasiKasus;
  layananResolusi?: LayananResolusiKasus;
  rendererNaratif?: PintuRendererNaratif;
  logger?: LoggerKomandoTelegram;

  /** Production/admin flow: generate case + human-in-the-loop asset tasks. */
  layananProduksiKasus?: { generateCase(seed: BenihKasus, opsi?: OpsiGenerasiKasus): Promise<KandidatKasus> };
  layananTugasAset?: {
    buatTugasAset(caseId: string, caseVersionId: string, plan: VisualPlan): Promise<{ taskId: string }>;
    kirimTugasAset(taskId: string): Promise<{ taskId: string; status: string; telegramMessageId?: string }>;
    kirimUlangTugasAset?(taskId: string): Promise<{ taskId: string; status: string; telegramMessageId?: string }>;
    verifikasiTugasAset(taskId: string): Promise<{ taskId: string; status: string }>;
    tolakTugasAset(taskId: string, reason: string): Promise<{ taskId: string; status: string }>;
  };
  repositoriAsetVisualProduksi?: { ambilManifest(caseId: string): Promise<ManifestAsetVisual | null> };
}

export interface HasilPerintahTelegram {
  command: string;
  message: string;
  session?: SesiKasus;
}

/** Satu sesi non-terminal per grup (docs/26.1): LOBBY/OPEN/PAUSED. */
const STATUS_SESI_NON_TERMINAL: ReadonlyArray<StatusSesi> = [StatusSesi.LOBBY, StatusSesi.OPEN, StatusSesi.PAUSED];

// ====== Batas input (BLOCKER 2) ======
// /docs/BETA-READINESS §Input Validation — text max 500; argumen/ID dibatasi lebih
// ketat dan daftar argumen di-bounded. Ditegakkan di SATU boundary prosesUpdate.
/** Batas panjang teks mentah Telegram. */
export const MAKS_PANJANG_TEKS_INPUT = 500;
/** Batas panjang satu argumen/ID (sceneId, objectId, suspectId, evidenceRef, …). */
export const MAKS_PANJANG_ARGUMEN = 128;
/** Batas jumlah argumen per command (bounded argument list). */
export const MAKS_JUMLAH_ARGUMEN = 20;

/**
 * Command yang melakukan MUTASI state kanonik (BLOCKER 3). Sebelum command
 * ini diproses, `amanUntukMutasiGame` memvalidasi context user/group + akses
 * grup secara fail-closed (melempar bila tidak valid). Command read-only
 * (/start, /status, /case, /suspects, /timeline, /contradictions) TIDAK
 * melewati guard ini.
 */
const KOMANDO_MUTASI_GAMEPLAY: ReadonlySet<string> = new Set([
  "/newcase",
  "/startcase",
  "/join",
  "/investigate",
  "/inspect",
  "/interrogate",
  "/confront",
  "/theory",
  "/accuse",
  "/vote",
  "/finalize",
]);

export class KomandoTelegramLayanan {
  constructor(private readonly konfigurasi: KonfigurasiKomandoTelegram) {}

  async prosesUpdate(permintaan: PermintaanTelegram): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    let command: string | undefined;
    try {
      if (!permintaan || !permintaan.updateId) {
        return gagal(new KesalahanValidasi("Update Telegram tidak valid."));
      }

      const chatIdValue = permintaan.chatId;
      const userIdTelegramValue = permintaan.userId;
      if (chatIdValue === undefined || userIdTelegramValue === undefined) {
        return gagal(new KesalahanValidasi("Context Telegram tidak valid."));
      }

      const chatId = String(chatIdValue);
      const userIdTelegram = String(userIdTelegramValue);
      if (typeof permintaan.command === "string") {
        // Strip @botusername suffix (Telegram adds this in groups)
        const baseCommand = permintaan.command.split("@")[0] ?? "";
        command = baseCommand.toLowerCase();
      } else {
        const rawText = typeof permintaan.text === "string" ? permintaan.text : "";
        const token = rawText.trim().split(/\s+/)[0] ?? "";
        if (token.startsWith("/")) {
          // Strip @botusername suffix (Telegram adds this in groups)
          const baseCommand = token.split("@")[0] ?? "";
          command = baseCommand.toLowerCase();
        }
      }
      if (!command) {
        return gagal(new KesalahanValidasi("Perintah tidak valid."));
      }

      const groupId = buatIdGrup(chatId);
      const userId = buatIdPemain(userIdTelegram);

      if (permintaan.chatType === "private") {
        if (command === "/start") {
          const pesan = "Selamat datang. Gunakan /newcase di grup untuk memulai sesi.";
          await this.kirimPesanAman(chatId, pesan, { command, updateId: permintaan.updateId });
          return berhasil({ command, message: pesan });
        }

        return gagal(new KesalahanValidasi("Perintah ini hanya tersedia di group."));
      }

      const validGroup = await this.konfigurasi.validasiGroupTelegram(chatId);
      if (!validGroup) {
        return gagal(new KesalahanValidasi("Grup tidak ditemukan."));
      }

      const aksesValid = await this.konfigurasi.validasiAksesTelegram(userIdTelegram, chatId);
      if (!aksesValid) {
        return gagal(new KesalahanAutorisasi("Anda tidak memiliki akses untuk mengelola grup ini."));
      }

      // SECURITY BOUNDARY (BLOCKER 2) — validasi input mentah untuk SEMUA command.
      // Enforce configured length limits: command, arguments, free text.
      // Invalid input berhenti SEBELUM dispatch ke handler apa pun.
      const validasiInput = validasiInputTelegram(
        typeof permintaan.text === "string" ? permintaan.text : undefined,
        MAKS_PANJANG_TEKS_INPUT,
      );
      if (!validasiInput.valid) {
        return gagal(new KesalahanValidasi(validasiInput.alasan ?? "input tidak valid"));
      }

      // SECURITY BOUNDARY (BLOCKER 3) — amanUntukMutasiGame hanya untuk command
      // yang melakukan mutasi gameplay. Hasilnya WAJIB dicek; tidak pernah diabaikan.
      if (KOMANDO_MUTASI_GAMEPLAY.has(command)) {
        // SECURITY BOUNDARY (BLOCKER 3) — helper ini THROWS bila context
        // user/group tidak valid atau akses grup belum tervalidasi. Hasilnya
        // tidak pernah boleh diabaikan; setiap command mutasi gameplay wajib
        // melewati gerbang ini SEBELUM dispatch ke handler. Otorisasi per-aksi
        // (harus detective aktif) tetap ditegakkan di dalam tiap layanan domain.
        amanUntukMutasiGame(userIdTelegram, chatId, aksesValid);
      }

      if (command === "/start") {
        const pesan = "Bot aktif. Gunakan /newcase untuk membuat sesi baru, lalu /startcase untuk memulai.";
        await this.kirimPesanAman(chatId, pesan, { command, updateId: permintaan.updateId });
        return berhasil({ command, message: pesan });
      }

      if (command === "/newcase") {
        return await this.buatSesiBaru(groupId, userId, permintaan.updateId, chatId);
      }

      if (command === "/startcase") {
        return await this.mulaiSesiAktif(groupId, userId, permintaan.updateId, chatId);
      }

      if (command === "/status") {
        return this.tampilkanStatus(groupId, chatId, permintaan.updateId);
      }

      // /case — tampilkan info kasus aktif (caseId & version) bila ada.
      if (command === "/case") {
        return this.tampilkanInfoKasus(groupId, chatId, permintaan.updateId);
      }

      // /join — peserta aktif menjadi detective (BLOCKER 1).
      // Spectator tidak pernah otomatis menjadi detective: mutasi participant
      // hanya terjadi lewat /join, dalam satu transaction Firestore.
      if (command === "/join") {
        return await this.joinSesi(groupId, userId, chatId, permintaan.updateId);
      }

      // ====== GAMEPLAY COMMANDS (Milestone wiring) ======
      // Seluruh command gameplay membutuhkan sesi aktif (bukan LOBBY terminal).
      // Argumen dipakai persis sesuai kontrak domain; rendering hanya lapisan tipis.
      const teksArgs = typeof permintaan.text === "string" ? permintaan.text.trim() : "";
      const argumen = teksArgs.split(/\s+/).slice(1).filter((bagian) => bagian.length > 0);

      // SECURITY BOUNDARY (BLOCKER 2) — validasi argument/ID di satu boundary.
      // Argumen gameplay (sceneId/objectId/suspectId/evidenceRef) ditangani seragam
      // SEBELUM dispatch mutasi: panjang per-argumen dan jumlah argumen dibatasi.
      // Menghindari duplicate validation di tiap command gameplay.
      if (argumen.length > MAKS_JUMLAH_ARGUMEN) {
        return gagal(new KesalahanValidasi(`Terlalu banyak argumen (maks ${MAKS_JUMLAH_ARGUMEN}).`));
      }
      for (const bagian of argumen) {
        const validasiArg = validasiInputTelegram(bagian, MAKS_PANJANG_ARGUMEN);
        if (!validasiArg.valid) {
          return gagal(new KesalahanValidasi(validasiArg.alasan ?? "argumen tidak valid"));
        }
      }

      // ====== PRODUCTION / ADMIN COMMANDS (admin-only) ======
      // TELEGRAM_BETA human-in-the-loop: generate case → push asset task ke
      // grup aset → admin gambar di vault → verifikasi → publish. Only admin.
      if (command === "/generatecase") {
        return await this.generateCaseAdmin(groupId, userId, chatId, permintaan.updateId, argumen);
      }
      if (command === "/publishcase") {
        return await this.publishCaseAdmin(groupId, userId, chatId, permintaan.updateId, argumen);
      }
      if (command === "/verifytask") {
        return await this.verifyTaskAdmin(groupId, userId, chatId, permintaan.updateId, argumen);
      }
      if (command === "/rejecttask") {
        return await this.rejectTaskAdmin(groupId, userId, chatId, permintaan.updateId, argumen);
      }
      if (command === "/resendtask") {
        return await this.resendTaskAdmin(groupId, userId, chatId, permintaan.updateId, argumen);
      }

      if (command === "/investigate") {
        return this.lakukanInvestigasi(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/inspect") {
        return this.lakukanPeriksa(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/suspects") {
        return this.tampilkanTersangka(groupId, chatId, permintaan.updateId);
      }
      if (command === "/interrogate") {
        return this.lakukanInterogasi(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/confront") {
        return this.lakukanKonfrontasi(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/timeline") {
        return this.tampilkanLinimasa(groupId, userId, chatId, permintaan.updateId);
      }
      if (command === "/contradictions") {
        return this.tampilkanKontradiksi(groupId, chatId, permintaan.updateId);
      }
      if (command === "/theory") {
        return this.perbaruiTeori(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/accuse") {
        return this.ajukanAkusasi(groupId, userId, argumen, chatId, permintaan.updateId);
      }
      if (command === "/vote") {
        return this.suaraAkusasi(groupId, userId, chatId, permintaan.updateId);
      }
      if (command === "/finalize") {
        return this.finalisasiAkusasi(groupId, userId, chatId, permintaan.updateId);
      }

      return gagal(new KesalahanValidasi("Perintah tidak didukung."));
    } catch (error) {
      // Duplicate delivery (update yang sama di-retry Telegram) → safe replay:
      // tidak ada mutasi kanonik kedua, response tetap sukses agar Telegram berhenti retry.
      if (error instanceof KesalahanIdempoten) {
        return berhasil({
          command: command ?? "",
          message: "Perintah ini sudah diproses sebelumnya. Tidak ada perubahan baru.",
        });
      }

      if (error instanceof Error) {
        return gagal(error);
      }
      return gagal(new KesalahanValidasi("Gagal memproses perintah Telegram."));
    }
  }

  /**
   * /join — mutasi participant atomic (BLOCKER 1, PERSIST-04):
   * read grup → klaim idempotency key → read sesi → validasi state →
   * tambahDetektifKeSesi (rule max-6 milik domain) → simpan sesi → event,
   * semuanya dalam SATU transaction Firestore. Concurrency: dua user yang
   * join bersamaan pada slot terakhir dieksekusi berurutan oleh transaction;
   * tepat satu menambah playerIds (yang lain melihat count sudah penuh).
   *
   * State gate sesuai docs/03-gameplay.md §3.2.1 + docs/02-product-scope & docs/BETA-READINESS:
   * - LOBBY: "Terbatas pada join/start/configuration" → join diizinkan;
   * - OPEN: sesi sudah dimulai (lobby ditutup) → join DITOLAK ("tombol join
   *   dinonaktifkan setelah lobby ditutup", "spectator tidak join mid-session");
   * - PAUSED: "Tidak allowed" → ditolak;
   * - CLEARED / ARCHIVED: terminal → ditolak.
   *
   * Idempotensi: user yang sudah di playerIds tidak diduplikasi (domain
   * helper mengembalikan sesi apa adanya) dan response tetap sukses;
   * duplicate Telegram update sama → safe replay via idempotency key.
   */
  private async joinSesi(groupId: IdGrup, userId: IdPemain, chatId: string, updateId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    // Delivery-level idempotency (docs/21.5): satu klaim per update Telegram.
    // Kunci update-id menjamin duplicate DELIVERY (Telegram mengulang update
    // yang sama) tidak memutasi dua kali. "Sudah menjadi detective" (join
    // ulang dengan update BARU) ditangani oleh domain helper tambahDetektifKeSesi
    // — bukan oleh kunci idempotensi — sehingga response-nya ramah ("sudah
    // join"), bukan error, dan tetap tidak membuat participant duplicate.
    const actionId = `telegram:update:${updateId}`;

    // Preflight di luar transaction: sesi harus ada dan dalam state yang
    // mengizinkan join. Keputusan otoritatif tetap diulang dalam transaction.
    const grup = await this.konfigurasi.repositoriGrup.ambil(groupId);
    if (!grup || grup.status !== "ACTIVE") {
      return gagal(new KesalahanValidasi("Grup tidak ditemukan atau dinonaktifkan."));
    }
    const sesiAktif = await this.ambilSesiDariGrup(grup);
    if (!sesiAktif) {
      const pesan = "Tidak ada sesi aktif. Admin grup dapat memulai dengan /newcase.";
      await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
      return berhasil({ command: "/join", message: pesan });
    }
    if (sesiAktif.status === StatusSesi.CLEARED) {
      const pesan = "Sesi ini sudah selesai dan tidak menerima peserta baru.";
      await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
      return berhasil({ command: "/join", message: pesan });
    }
    if (sesiAktif.status === StatusSesi.OPEN) {
      const pesan = "Sesi sudah dimulai dan tidak menerima peserta baru. Bergabunglah pada lobby sebelum /startcase.";
      await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
      return berhasil({ command: "/join", message: pesan });
    }
    if (sesiAktif.status === StatusSesi.PAUSED) {
      const pesan = "Sesi sedang dijeda dan tidak menerima peserta baru.";
      await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
      return berhasil({ command: "/join", message: pesan });
    }
    if (sesiAktif.status === StatusSesi.ARCHIVED) {
      const pesan = "Sesi ini sudah diarsipkan dan tidak menerima peserta baru.";
      await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
      return berhasil({ command: "/join", message: pesan });
    }

    const waktuSekarang = this.konfigurasi.waktu.sekarangIso();
    let sudahMenjadiDetektif = true;
    let eventJoinBaru: KejadianDomain | null = null;
    let eventTertulisDalamTransaksi = false;

    let sesiHasil: SesiKasus;
    try {
      sesiHasil = await this.konfigurasi.repositoriSesiKasus.transaksi(async (transaction) => {
      // (1) read state otoritatif dalam transaction.
      const grupTx = await this.konfigurasi.repositoriGrup.ambil(groupId, transaction);
      if (!grupTx || grupTx.status !== "ACTIVE") {
        throw new KesalahanValidasi("Grup tidak ditemukan atau dinonaktifkan.");
      }
      const sesiTx = await this.ambilSesiDariGrup(grupTx, transaction);
      if (!sesiTx) {
        throw new KesalahanValidasi("Tidak ada sesi aktif untuk grup ini.");
      }

      // (2) klaim idempotency key secara atomic — duplicate delivery
      //     → throw KesalahanIdempoten → rollback → safe replay di catch.
      const klaim = await this.klaimKunciIdempoten(actionId, sesiTx.sessionId, transaction);
      if (klaim) {
        throw new KesalahanIdempoten("Duplicate Telegram update telah diproses.");
      }

      // (3) state gate final — join hanya saat sesi BELUM dimulai (LOBBY).
      //     OPEN/PAUSED/CLEARED/ARCHIVED menolak join (docs/03 §3.2.1,
      //     docs/02 — tombol join nonaktif setelah lobby ditutup).
      if (sesiTx.status !== StatusSesi.LOBBY) {
        throw new KesalahanValidasi(
          `Sesi berstatus ${sesiTx.status} tidak mengizinkan join.`,
        );
      }

      // (4) rule max-6 + anti-duplikasi milik domain — JANGAN di-reimplementasi
      //     di handler. Duplicate join mengembalikan sesi apa adanya.
      sudahMenjadiDetektif = sesiTx.playerIds.includes(userId);
      const sesiBaru = tambahDetektifKeSesi(sesiTx, userId, waktuSekarang);

      // (5) persist mutasi kanonik.
      await this.konfigurasi.repositoriSesiKasus.simpan(sesiBaru, transaction);

      // (6) event PLAYER_JOINED hanya untuk join baru (bukan replay/duplicate).
      // Persist atomic bersama mutasi kanonik; bila publisher tidak mendukung
      // transaction, fallback post-commit dikirim setelah commit (PERSIST-07).
      if (!sudahMenjadiDetektif) {
        eventJoinBaru = {
          eventId: buatIdEvent(`evt-${actionId}-PLAYER_JOINED`) as IdEvent,
          eventVersion: 1,
          sessionId: sesiBaru.sessionId,
          groupId,
          actorUserId: userId,
          type: JenisKejadianDomain.PLAYER_JOINED,
          payload: {
            sessionId: String(sesiBaru.sessionId),
            participantCount: sesiBaru.playerIds.length,
            maxActive: BATAS_DETEKTIF_AKTIF,
          },
          actionId,
          occurredAt: waktuSekarang,
        };
        eventTertulisDalamTransaksi = this.catatEventDalamTransaksi(eventJoinBaru, transaction);
      }

      return sesiBaru;
      });
    } catch (error) {
      // Keputusan otoritatif di dalam transaction: sesi penuh / state menolak
      // join → beri pesan jelas ke chat. KesalahanIdempoten diteruskan ke catch
      // prosesUpdate sebagai safe replay (duplicate delivery, tanpa mutasi kedua).
      if (error instanceof KesalahanIdempoten) {
        throw error;
      }
      if (error instanceof KesalahanValidasi) {
        const pesan = error.message;
        await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
        return berhasil({ command: "/join", message: pesan });
      }
      throw error;
    }

    // Event persistence fallback (post-commit) bila publisher tidak mendukung tx.
    if (eventJoinBaru && !eventTertulisDalamTransaksi) {
      await this.konfigurasi.penerbitEventDomain.kirim(eventJoinBaru);
    }

    let pesan: string;
    if (sudahMenjadiDetektif) {
      pesan = "Anda sudah menjadi Detective aktif pada sesi ini.";
    } else {
      pesan = `Anda bergabung sebagai Detective aktif (${sesiHasil.playerIds.length}/${BATAS_DETEKTIF_AKTIF}).`;
    }
    this.konfigurasi.logger?.info?.("join diproses", {
      groupId: String(groupId),
      sessionId: String(sesiHasil.sessionId),
      sudahDetektif: sudahMenjadiDetektif,
      participantCount: sesiHasil.playerIds.length,
    });
    await this.kirimPesanAman(chatId, pesan, { command: "/join", updateId: actionId });
    return berhasil({ command: "/join", message: pesan, session: sesiHasil });
  }

  /**
   * /newcase — atomic (PERSIST-04):
   * SEMUA mutasi kanonik (sesi + pointer grup + event + idempotency) dilakukan
   * dalam SATU transaction Firestore, sehingga concurrent /newcase pada grup
   * yang sama tidak mungkin menghasilkan dua sesi aktif.
   */
  private async buatSesiBaru(groupId: IdGrup, userId: IdPemain, updateId: string, chatId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const actionId = `telegram:update:${updateId}`;
    const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

    // Content read di luar transaction: CaseVersion published bersifat immutable.
    const versi = await this.ambilVersiTerbitan();
    if (!versi) {
      return gagal(new KesalahanValidasi("Tidak ada CaseVersion published yang tersedia."));
    }

    const sessionIdBaru = buatIdSesiKasus(`${String(groupId)}:${String(versi.caseId)}:${updateId}`) as IdSesiKasus;

    // Fast-path duplicate delivery (update sama di-retry Telegram): safe replay
    // tanpa menyentuh pengecekan sesi aktif / mutasi apa pun.
    const kunciSebelumnya = await this.konfigurasi.kontrakIdempoten.ambilKunci(actionId, sessionIdBaru);
    if (kunciSebelumnya) {
      return berhasil({ command: "/newcase", message: "Perintah ini sudah diproses sebelumnya. Tidak ada perubahan baru." });
    }
    const sesiBaru: SesiKasus = {
      sessionId: sessionIdBaru,
      caseId: versi.caseId,
      caseVersionId: versi.versionId,
      groupId,
      status: StatusSesi.LOBBY,
      outcome: null,
      playerIds: [userId],
      discoveredEvidenceIds: [],
      examinedObjectIds: [],
      unlockedDialogueIds: [],
      teamTheory: null,
      score: 0,
      updatedAt: waktuSekarang,
      unlockedStatementIds: [],
      discoveredContradictionIds: [],
      knownTimelineEventIds: [],
    };

    const event: KejadianDomain = {
      eventId: buatIdEvent(`evt-${actionId}-CASE_SESSION_CREATED`),
      eventVersion: 1,
      sessionId: sessionIdBaru,
      groupId,
      actorUserId: userId,
      type: JenisKejadianDomain.CASE_SESSION_CREATED,
      payload: {
        caseId: String(versi.caseId),
        caseVersionId: String(versi.versionId),
        createdBy: String(userId),
      },
      actionId,
      occurredAt: waktuSekarang,
    };

    let eventTertulisDalamTransaksi = false;
    const kotakGrup: { grup: Grup | null } = { grup: null };

    const sesiDisimpan = await this.konfigurasi.repositoriSesiKasus.transaksi(async (transaction) => {
      // (1) read group/session state dalam transaction.
      const grup = await this.konfigurasi.repositoriGrup.ambil(groupId, transaction);
      if (!grup) {
        throw new KesalahanValidasi("Grup tidak ditemukan.");
      }
      if (grup.status === "DISABLED") {
        throw new KesalahanAutorisasi("Grup dinonaktifkan.");
      }
      kotakGrup.grup = grup;

      // (2) claim idempotency key secara atomic — duplicate → mutasi tidak diulang.
      const sudahAda = await this.klaimKunciIdempoten(actionId, sessionIdBaru, transaction);
      if (sudahAda) {
        throw new KesalahanIdempoten("Duplicate Telegram update telah diproses.");
      }

      // (3) determine whether an active session exists (authoritative, in-tx).
      const sesiAktif = await this.ambilSesiDariGrup(grup, transaction);
      if (sesiAktif && STATUS_SESI_NON_TERMINAL.includes(sesiAktif.status)) {
        throw new KesalahanValidasi("Sudah ada sesi aktif untuk grup ini.");
      }

      // (4) create/claim new session.
      await this.konfigurasi.repositoriSesiKasus.simpan(sesiBaru, transaction);

      // (5) update group active session reference (field existing).
      await this.konfigurasi.repositoriGrup.simpan({ ...grup, activeCaseSessionId: sessionIdBaru }, transaction);

      // (6) persist event secara atomic bersama mutasi kanonik.
      eventTertulisDalamTransaksi = this.catatEventDalamTransaksi(event, transaction);

      return sesiBaru;
    });

    // Event persistence fallback (post-commit) bila publisher tidak mendukung tx.
    if (!eventTertulisDalamTransaksi) {
      await this.konfigurasi.penerbitEventDomain.kirim(event);
    }

    const briefing = `Sesi kasus baru dibuat. Case: ${versi.metadata.title}. Status: LOBBY. Gunakan /startcase untuk memulai.`;
    const grupUntukChat = kotakGrup.grup;
    const chatIdTujuan = grupUntukChat ? String(grupUntukChat.telegramChatId) : chatId;
    await this.kirimPesanAman(chatIdTujuan, briefing, {
      command: "/newcase",
      updateId,
      sessionId: String(sesiDisimpan.sessionId),
    });

    return berhasil({ command: "/newcase", message: briefing, session: sesiDisimpan });
  }

  /**
   * /startcase — atomic: tepat satu transisi LOBBY → OPEN kanonik.
   * Concurrent A+B: A commit; B retry → validasiTransisiSesi(OPEN→OPEN) gagal →
   * B ditolak tanpa mutasi. Duplicate update yang sama → safe replay.
   */
  private async mulaiSesiAktif(groupId: IdGrup, userId: IdPemain, updateId: string, chatId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    // Pre-transaction (read-only, di luar tx): validasi admin + resolusi pointer.
    const adminValid = await this.validasiAdmin(userId, groupId);
    if (!adminValid) {
      return gagal(new KesalahanAutorisasi("Hanya admin grup yang dapat memulai case."));
    }

    const actionId = `telegram:update:${updateId}`;

    // Fast-path duplicate delivery: update sama yang sudah diproses → safe replay.
    // (Authoritative claim tetap dilakukan dalam transaction di bawah.)
    const sesiReferensiAwal = await this.ambilSesiAktifGrup(groupId);
    if (sesiReferensiAwal) {
      const kunciSebelumnya = await this.konfigurasi.kontrakIdempoten.ambilKunci(
        actionId,
        sesiReferensiAwal.sessionId as IdSesiKasus,
      );
      if (kunciSebelumnya) {
        return berhasil({
          command: "/startcase",
          message: "Perintah ini sudah diproses sebelumnya. Tidak ada perubahan baru.",
          session: sesiReferensiAwal,
        });
      }
    }

    const sesiReferensi = sesiReferensiAwal;
    if (!sesiReferensi) {
      return gagal(new KesalahanValidasi("Tidak ada sesi aktif untuk grup ini."));
    }
    if (sesiReferensi.status !== StatusSesi.LOBBY) {
      return gagal(new KesalahanValidasi("Sesi tidak berada di status LOBBY."));
    }

    const sessionId = sesiReferensi.sessionId as IdSesiKasus;
    const waktuSekarang = this.konfigurasi.waktu.sekarangIso();

    const event: KejadianDomain = {
      eventId: buatIdEvent(`evt-${actionId}-CASE_STARTED`),
      eventVersion: 1,
      sessionId,
      groupId,
      actorUserId: userId,
      type: JenisKejadianDomain.CASE_STARTED,
      payload: {
        caseId: String(sesiReferensi.caseId),
        caseVersionId: String(sesiReferensi.caseVersionId),
        startedBy: String(userId),
      },
      actionId,
      occurredAt: waktuSekarang,
    };

    let eventTertulisDalamTransaksi = false;

    const sesiMulai = await this.konfigurasi.repositoriSesiKasus.transaksi(async (transaction) => {
      const sesiSaatIni = await this.konfigurasi.repositoriSesiKasus.ambil(sessionId, transaction);
      if (!sesiSaatIni) {
        throw new KesalahanValidasi("Sesi tidak bisa dimulai pada status saat ini.");
      }

      // Duplicate update → klaim atomic menolak mutasi kanonik kedua.
      const sudahAda = await this.klaimKunciIdempoten(actionId, sessionId, transaction);
      if (sudahAda) {
        throw new KesalahanIdempoten("Duplicate Telegram update untuk startcase sudah diproses.");
      }

      // State transition tetap lewat domain rule existing (bukan rule handler).
      validasiTransisiSesi(sesiSaatIni.status, StatusSesi.OPEN);
      const sesiDibuka = mulaiSesi(sesiSaatIni, waktuSekarang);

      await this.konfigurasi.repositoriSesiKasus.simpan(sesiDibuka, transaction);
      eventTertulisDalamTransaksi = this.catatEventDalamTransaksi(event, transaction);

      return sesiDibuka;
    });

    if (!eventTertulisDalamTransaksi) {
      await this.konfigurasi.penerbitEventDomain.kirim(event);
    }

    const pesan = "Case dimulai. Status: OPEN. Tim bisa mulai investigasi.";
    await this.kirimPesanAman(chatId, pesan, {
      command: "/startcase",
      updateId,
      sessionId: String(sesiMulai.sessionId),
    });

    return berhasil({ command: "/startcase", message: pesan, session: sesiMulai });
  }

  private async tampilkanStatus(groupId: IdGrup, chatId: string, updateId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const sesi = await this.ambilSesiAktifGrup(groupId);
    if (!sesi) {
      const pesanKosong = "Tidak ada sesi aktif untuk grup ini.";
      await this.kirimPesanAman(chatId, pesanKosong, { command: "/status", updateId });
      return berhasil({ command: "/status", message: pesanKosong });
    }

    const statusEfektif = sesi.status === StatusSesi.PAUSED ? "PAUSED" : sesi.status === StatusSesi.CLEARED ? "CLEARED" : sesi.status === StatusSesi.ARCHIVED ? "ARCHIVED" : "ACTIVE";
    const pesan = `Status sesi: ${sesi.status} (${statusEfektif}). Progress: ${sesi.discoveredEvidenceIds.length} bukti ditemukan, ${sesi.playerIds.length} pemain.`;
    await this.kirimPesanAman(chatId, pesan, { command: "/status", updateId, sessionId: String(sesi.sessionId) });
    return berhasil({ command: "/status", message: pesan, session: sesi });
  }

  // Helper for /case command – show active case identifiers.
  private async tampilkanInfoKasus(
    groupId: IdGrup,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const sesi = await this.ambilSesiAktifGrup(groupId);
    if (!sesi) {
      const msg = "Tidak ada kasus aktif untuk grup ini.";
      await this.kirimPesanAman(chatId, msg, { command: "/case", updateId });
      return berhasil({ command: "/case", message: msg });
    }

    const msg = `Kasus aktif: ${sesi.caseId} (versi ${sesi.caseVersionId}).`;
    await this.kirimPesanAman(chatId, msg, { command: "/case", updateId, sessionId: String(sesi.sessionId) });
    return berhasil({ command: "/case", message: msg, session: sesi });
  }

  // ====== GAMEPLAY COMMAND HANDLERS ======
  // Lapisan tipis: parse/validasi argumen, resolve sesi aktif, panggil layanan,
  // render hasil. Seluruh gameplay rule tetap di domain/application service.

  private async sesiGameplayAktif(groupId: IdGrup): Promise<{ sesi: SesiKasus; error?: undefined } | { sesi?: undefined; error: Error }> {
    const sesi = await this.ambilSesiAktifGrup(groupId);
    if (!sesi) {
      return { error: new KesalahanValidasi("Tidak ada sesi aktif untuk grup ini.") };
    }
    if (sesi.status !== StatusSesi.OPEN) {
      return { error: new KesalahanValidasi("Aksi gameplay hanya valid ketika sesi berstatus OPEN.") };
    }
    return { sesi };
  }

  private ambilLayanan<T>(layanan: T | undefined, nama: string): T {
    if (!layanan) {
      throw new KesalahanValidasi(`Layanan ${nama} belum ter-wiring di composition root.`);
    }
    return layanan;
  }

  private async ambilCaseBibleUntukSesi(sesi: SesiKasus): Promise<CaseBible> {
    const repositori = this.ambilLayanan(this.konfigurasi.repositoriCaseBible, "repositoriCaseBible");
    const ref = `case-bible:${String(sesi.caseId)}:golden`;
    const caseBible = await repositori.ambilCaseBible(ref);
    if (!caseBible) {
      throw new KesalahanValidasi("Case Bible tidak ditemukan untuk sesi ini.");
    }
    return caseBible;
  }

  private async kirimHasilGameplay<T>(
    command: string,
    chatId: string,
    updateId: string,
    sesi: SesiKasus,
    hasil: HasilOperasi<T, Error>,
    render: (data: T) => string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const korelasi = { command, updateId, sessionId: String(sesi.sessionId) };
    if (hasil.status === "berhasil") {
      const pesan = render(hasil.data);
      await this.kirimPesanAman(chatId, pesan, korelasi);
      return berhasil({ command, message: pesan, session: sesi });
    }
    const pesanGagal = hasil.error instanceof Error ? hasil.error.message : "Terjadi kesalahan.";
    await this.kirimPesanAman(chatId, pesanGagal, korelasi);
    return gagal(hasil.error);
  }

  private async tampilkanBantuanArgumen(pola: string, chatId: string, updateId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const pesan = `Argumen tidak lengkap.\n\nContoh: ${pola}`;
    await this.kirimPesanAman(chatId, pesan, { command: "gameplay", updateId });
    return berhasil({ command: "gameplay", message: pesan });
  }

  private async lakukanInvestigasi(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const sceneId = argumen[0];
    if (!sceneId) return this.tampilkanBantuanArgumen("/investigate <sceneId>", chatId, updateId);

    const layanan = this.ambilLayanan(this.konfigurasi.layananInvestigasi, "layananInvestigasi");
    const hasil = await layanan.prosesInvestigasiAdegan({ sessionId: konteks.sesi.sessionId, userId, sceneId });
    return this.kirimHasilGameplay("/investigate", chatId, updateId, konteks.sesi, hasil, (data) => {
      if (data.objekTampak.length === 0) {
        return `🔎 Adegan ${sceneId}\n\nTidak ada objek yang terlihat saat ini.`;
      }
      const daftar = data.objekTampak.map((objek) => `• ${objek.objectId} — ${objek.name}`).join("\n");
      return `🔎 Adegan ${sceneId}\n\n${daftar}\n\nGunakan /inspect <objectId> untuk memeriksa.`;
    });
  }

  private async lakukanPeriksa(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const objectId = argumen[0];
    if (!objectId) return this.tampilkanBantuanArgumen("/inspect <objectId>", chatId, updateId);

    const layanan = this.ambilLayanan(this.konfigurasi.layananInvestigasi, "layananInvestigasi");
    const hasil = await layanan.prosesPeriksaObjek({ sessionId: konteks.sesi.sessionId, userId, objectId });
    return this.kirimHasilGameplay("/inspect", chatId, updateId, konteks.sesi, hasil, (data) => {
      const bukti = data.evidenceBaruDitemukan && data.evidenceId ? `\n\n✅ Evidence ditemukan: ${data.evidenceId}` : "";
      const sudah = data.sudahDiperiksaSebelumnya ? "\n\n(Sudah diperiksa sebelumnya.)" : "";
      return `${data.observasi.text}${bukti}${sudah}`;
    });
  }

  private async tampilkanTersangka(
    groupId: IdGrup,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    let caseBible: CaseBible;
    try {
      caseBible = await this.ambilCaseBibleUntukSesi(konteks.sesi);
    } catch (error) {
      return gagal(error instanceof Error ? error : new KesalahanValidasi("Case Bible tidak tersedia."));
    }

    const daftar = caseBible.suspects.map((s) => `• ${s.suspectId} — ${s.name} (${s.occupation})`).join("\n");
    const pesan = `🕵️ Tersangka\n\n${daftar}\n\nGunakan /interrogate <suspectId> <maksud> untuk menginterogasi.`;
    await this.kirimPesanAman(chatId, pesan, { command: "/suspects", updateId, sessionId: String(konteks.sesi.sessionId) });
    return berhasil({ command: "/suspects", message: pesan, session: konteks.sesi });
  }

  private async lakukanInterogasi(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const suspectId = argumen[0];
    const maksudValue = argumen[1];
    if (!suspectId || !maksudValue) {
      return this.tampilkanBantuanArgumen("/interrogate <suspectId> <ASK_ALIBI|ASK_VICTIM|ASK_MOTIVE|ASK_TIMELINE|ASK_RELATIONSHIP|ASK_EVIDENCE>", chatId, updateId);
    }

    const MAKSUD_VALID: readonly MaksudInterogasi[] = ["ASK_ALIBI", "ASK_VICTIM", "ASK_MOTIVE", "ASK_TIMELINE", "ASK_RELATIONSHIP", "ASK_EVIDENCE"];
    const maksud = MAKSUD_VALID.find((m) => m === maksudValue.toUpperCase());
    if (!maksud) {
      return gagal(new KesalahanValidasi(`Maksud interogasi tidak dikenali: ${maksudValue}.`));
    }

    const layanan = this.ambilLayanan(this.konfigurasi.layananInterogasi, "layananInterogasi");
    const hasil = await layanan.prosesInterogasi({ sessionId: konteks.sesi.sessionId, userId, suspectId, maksud });
    return this.kirimHasilGameplay("/interrogate", chatId, updateId, konteks.sesi, hasil, (data) => {
      const statusUnlock = data.statementBaruDiunlock
        ? "\n\n📌 Statement baru ter-unlock."
        : data.nodeBaruDiunlock
          ? "\n\n💬 Dialog baru ter-unlock."
          : data.sudahDiunlockSebelumnya
            ? "\n\n(Sudah dibuka sebelumnya.)"
            : "";
      return `${data.responseText}${statusUnlock}`;
    });
  }

  private async lakukanKonfrontasi(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const suspectId = argumen[0];
    const evidenceId = argumen[1];
    if (!suspectId || !evidenceId) {
      return this.tampilkanBantuanArgumen("/confront <suspectId> <evidenceId>", chatId, updateId);
    }

    const layanan = this.ambilLayanan(this.konfigurasi.layananInterogasi, "layananInterogasi");
    const hasil = await layanan.prosesKonfrontasi({ sessionId: konteks.sesi.sessionId, userId, suspectId, evidenceId });
    return this.kirimHasilGameplay("/confront", chatId, updateId, konteks.sesi, hasil, (data) => {
      const bagianBaru = data.kontradiksiBaruDitemukan ? `\n\n🔥 Kontradiksi ditemukan: ${data.contradictionId}` : "";
      const timeline = data.timelineBaruDiketahui ? "\n\n🗓️ Informasi timeline baru terungkap." : "";
      const sudah = data.sudahDikonfrontasiSebelumnya ? "\n\n(Sudah dikonfrontasi sebelumnya.)" : "";
      return `${suspectId} dikonfrontasi dengan ${evidenceId}.${bagianBaru}${timeline}${sudah}`;
    });
  }

  private async tampilkanLinimasa(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const layanan = this.ambilLayanan(this.konfigurasi.layananInterogasi, "layananInterogasi");
    const hasil = await layanan.prosesAmbilLinimasa({ sessionId: konteks.sesi.sessionId, userId });
    return this.kirimHasilGameplay("/timeline", chatId, updateId, konteks.sesi, hasil, (data: PeristiwaLinimasa[]) => {
      if (data.length === 0) {
        return "🗓️ Timeline\n\nBelum ada peristiwa linimasa yang diketahui.";
      }
      const daftar = data.map((p) => `• ${p.eventId} — ${p.action} (${p.truthStatus})`).join("\n");
      return `🗓️ Timeline\n\n${daftar}`;
    });
  }

  private async tampilkanKontradiksi(
    groupId: IdGrup,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const daftar = konteks.sesi.discoveredContradictionIds;
    const pesan = daftar.length === 0
      ? "🔥 Kontradiksi\n\nBelum ada kontradiksi yang ditemukan."
      : `🔥 Kontradiksi\n\n${daftar.map((id) => `• ${id}`).join("\n")}`;
    await this.kirimPesanAman(chatId, pesan, { command: "/contradictions", updateId, sessionId: String(konteks.sesi.sessionId) });
    return berhasil({ command: "/contradictions", message: pesan, session: konteks.sesi });
  }

  private async perbaruiTeori(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const suspectId = argumen[0];
    if (!suspectId) return this.tampilkanBantuanArgumen("/theory <suspectId>", chatId, updateId);

    const layanan = this.ambilLayanan(this.konfigurasi.layananResolusi, "layananResolusi");
    const hasil = await layanan.prosesPerbaruiTeori({ sessionId: konteks.sesi.sessionId, userId, culpritSuspectId: suspectId });
    return this.kirimHasilGameplay("/theory", chatId, updateId, konteks.sesi, hasil, (data) => {
      return `🧠 Teori tim\n\nPelaku hipotesis: ${suspectId}\nDukungan: ${data.support}`;
    });
  }

  private async ajukanAkusasi(
    groupId: IdGrup,
    userId: IdPemain,
    argumen: string[],
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const suspectId = argumen[0];
    if (!suspectId) return this.tampilkanBantuanArgumen("/accuse <suspectId>", chatId, updateId);

    const layanan = this.ambilLayanan(this.konfigurasi.layananResolusi, "layananResolusi");
    const hasil = await layanan.prosesAjukanTuduhan({ sessionId: konteks.sesi.sessionId, userId, suspectId });
    return this.kirimHasilGameplay("/accuse", chatId, updateId, konteks.sesi, hasil, (data) => {
      return `⚖️ Proposal accusation diajukan untuk ${suspectId}. Status: ${data.status}. Gunakan /vote untuk memberikan suara.`;
    });
  }

  private async suaraAkusasi(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const layanan = this.ambilLayanan(this.konfigurasi.layananResolusi, "layananResolusi");
    const hasil = await layanan.prosesVoteTuduhan({ sessionId: konteks.sesi.sessionId, userId });
    return this.kirimHasilGameplay("/vote", chatId, updateId, konteks.sesi, hasil, (data) => {
      const qualified = data.status === "QUALIFIED";
      const suara = data.votes.length;
      return `🗳️ Suara tercatat (${suara} pemain).${qualified ? "\n\nProposal qualified — siap difinalisasi dengan /finalize." : ""}`;
    });
  }

  private async finalisasiAkusasi(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const konteks = await this.sesiGameplayAktif(groupId);
    if (!konteks.sesi) return gagal(konteks.error);
    const layanan = this.ambilLayanan(this.konfigurasi.layananResolusi, "layananResolusi");
    const hasil = await layanan.prosesFinalisasiTuduhan({ sessionId: konteks.sesi.sessionId, userId });

    const korelasi = { command: "/finalize", updateId, sessionId: String(konteks.sesi.sessionId) };
    if (hasil.status === "berhasil") {
      const data = hasil.data;
      const outcome = data.correctCulprit ? "SOLVED ✅" : "FAILED ❌";
      const pesan = `🔔 Final accusation: ${data.suspectId}\nKepastian: ${data.correctCulprit ? "Benar" : "Salah"}\nHasil kasus: ${outcome}`;
      await this.kirimPesanAman(chatId, pesan, korelasi);
      return berhasil({ command: "/finalize", message: pesan, session: konteks.sesi });
    }

    const pesanGagal = hasil.error instanceof Error ? hasil.error.message : "Terjadi kesalahan saat finalisasi.";
    await this.kirimPesanAman(chatId, pesanGagal, korelasi);
    return gagal(hasil.error);
  }

  private async ambilSesiAktifGrup(groupId: IdGrup, transaction?: Transaction): Promise<SesiKasus | null> {
    const grup = await this.konfigurasi.repositoriGrup.ambil(groupId, transaction);
    if (!grup) {
      return null;
    }

    return this.ambilSesiDariGrup(grup, transaction);
  }

  /** Active session lookup via reference existing `groups/{id}.activeCaseSessionId` — tanpa full collection scan. */
  private async ambilSesiDariGrup(grup: Grup, transaction?: Transaction): Promise<SesiKasus | null> {
    if (!grup.activeCaseSessionId) {
      return null;
    }

    return this.konfigurasi.repositoriSesiKasus.ambil(grup.activeCaseSessionId as IdSesiKasus, transaction);
  }

  private async ambilVersiTerbitan(): Promise<VersiKasus | null> {
    const repositori = this.konfigurasi.repositoriVersiKasus;
    if (repositori.ambilVersiKasusTerbitan) {
      return repositori.ambilVersiKasusTerbitan();
    }

    if (repositori.ambilVersiKasus) {
      return repositori.ambilVersiKasus();
    }

    return null;
  }

  /** Klaim atomic kunci idempotensi; fallback ambil+simpan untuk kontrak lama (dalam transaction tetap atomic). */
  private async klaimKunciIdempoten(actionId: string, sessionId: IdSesiKasus, transaction?: Transaction): Promise<boolean> {
    const kontrak = this.konfigurasi.kontrakIdempoten;

    if (typeof kontrak.klaimKunci === "function") {
      const hasil = await kontrak.klaimKunci(actionId, sessionId, transaction);
      return hasil.sudahAda;
    }

    const kunci = await kontrak.ambilKunci(actionId, sessionId, transaction);
    if (kunci) {
      return true;
    }

    await kontrak.simpanKunci({ actionId, sessionId, repeated: false }, transaction);
    return false;
  }

  /** Persist event dalam transaction yang sama dengan mutasi kanonik (bila didukung). */
  private catatEventDalamTransaksi(event: KejadianDomain, transaction: Transaction): boolean {
    const penerbit = this.konfigurasi.penerbitEventDomain;
    if (typeof penerbit.tulisDalamTransaksi === "function") {
      penerbit.tulisDalamTransaksi(event, transaction);
      return true;
    }
    return false;
  }

  /**
   * Outbound Telegram SETELAH commit: kegagalan TIDAK me-rollback canonical
   * state (PERSIST-07, docs/22.7). Kegagalan dicatat dengan correlation ID.
   */
  private async kirimPesanAman(
    chatId: string,
    pesan: string,
    korelasi: { command: string; updateId: string; sessionId?: string },
    opsi?: { parseMode?: "Markdown" },
  ): Promise<void> {
  console.log(JSON.stringify({ debug: "mencoba_kirim", chatId, pesanPanjang: pesan.length, ...korelasi }));
  try {
    await (this.konfigurasi.kirimPesanTelegram as (c: string, m: string, o?: { parseMode?: "Markdown" }) => Promise<void>)(chatId, pesan, opsi);
    console.log(JSON.stringify({ debug: "kirim_sukses", chatId }));
  } catch (error) {
    if (opsi?.parseMode) {
      try {
        await this.konfigurasi.kirimPesanTelegram(chatId, pesan);
        console.log(JSON.stringify({ debug: "kirim_sukses_fallback", chatId }));
        return;
      } catch {}
    }
    console.log(JSON.stringify({
      debug: "kirim_gagal",
      ...korelasi,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

  /** Guard admin untuk command produksi (creator/administrator) — kirim pesan bila ditolak. */
  private async pastikanAdminGrup(
    userId: IdPemain,
    groupId: IdGrup,
    chatId: string,
    command: string,
    updateId: string,
  ): Promise<boolean> {
    const admin = await this.validasiAdmin(userId, groupId);
    if (!admin) {
      const pesan = "Perintah ini khusus admin grup.";
      await this.kirimPesanAman(chatId, pesan, { command, updateId });
      return false;
    }
    return true;
  }

  /**
   * /generatecase — ADMIN: generate case baru (AI) + buat & kirim AssetTask ke
   * grup aset (TELEGRAM_BETA human-in-the-loop). Kandidat disimpan DRAFT;
   * publish hanya setelah semua task diverifikasi (lihat /publishcase).
   */
  private async generateCaseAdmin(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
    argumen: string[],
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    if (!(await this.pastikanAdminGrup(userId, groupId, chatId, "/generatecase", updateId))) {
      return berhasil({ command: "/generatecase", message: "Perintah ini khusus admin grup." });
    }

    const actionId = `telegram:update:${updateId}`;
    const sesiIdempoten = `${String(groupId)}:generatecase:${updateId}` as IdSesiKasus;
    // Klaim kunci idempotensi SEBELUM pesan ⏳ & AI call berat (120s deepseek).
    // Duplicate webhook (Telegram retry saat Vercel timeout) → duplicate delivery
    // berhenti di sini tanpa pesan ganda & tanpa generate kedua yang mubazir.
    try {
      const hasilKlaim = await this.konfigurasi.kontrakIdempoten.klaimKunci?.(actionId, sesiIdempoten);
      if (hasilKlaim?.sudahAda) {
        return berhasil({ command: "/generatecase", message: "Perintah ini sudah diproses sebelumnya. Tidak ada perubahan baru." });
      }
      if (!hasilKlaim) {
        const kunciSebelumnya = await this.konfigurasi.kontrakIdempoten.ambilKunci(actionId, sesiIdempoten);
        if (kunciSebelumnya) {
          return berhasil({ command: "/generatecase", message: "Perintah ini sudah diproses sebelumnya. Tidak ada perubahan baru." });
        }
        await this.konfigurasi.kontrakIdempoten.simpanKunci({ actionId, sessionId: sesiIdempoten, repeated: false });
      }
    } catch {
      // klaim idempotensi best-effort; gagal klaim → lanjut generate (tidak blokir)
    }

    const produksi = this.konfigurasi.layananProduksiKasus;
    const tugasAset = this.konfigurasi.layananTugasAset;
    if (!produksi || !tugasAset) {
      const pesan = "Fitur generate case belum dikonfigurasi pada bot ini.";
      await this.kirimPesanAman(chatId, pesan, { command: "/generatecase", updateId });
      return berhasil({ command: "/generatecase", message: pesan });
    }

    const genre = argumen[0] ? String(argumen[0]).slice(0, MAKS_PANJANG_ARGUMEN) : "mystery";
    const sceneCountParsed = Number(argumen[1]);
    const sceneCount = Number.isInteger(sceneCountParsed) && sceneCountParsed >= 1 && sceneCountParsed <= 6 ? sceneCountParsed : 2;
    const seed: BenihKasus = {
      genre,
      setting: "a secluded private location",
      difficulty: "MEDIUM",
      suspectCount: 3,
      sceneCount,
      mustUseMechanics: [],
    };

    await this.kirimPesanAman(chatId, "⏳ Membuat case baru (AI)… ini bisa butuh beberapa menit.", { command: "/generatecase", updateId });

    let kandidat: KandidatKasus;
    try {
      kandidat = await produksi.generateCase(seed);
    } catch (error) {
      const pesan = `⚠️ Generate case gagal: ${error instanceof Error ? error.message || error.name : String(error)}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/generatecase", updateId });
      return berhasil({ command: "/generatecase", message: pesan });
    }

    const plans = turunanVisualPlanDariKasus(kandidat.caseBible);
    const terkirim: string[] = [];
    let gagalKirim = 0;
    for (const plan of plans) {
      try {
        const tBaru = await tugasAset.buatTugasAset(kandidat.caseId, kandidat.versionId, plan);
        const tKirim = await tugasAset.kirimTugasAset(tBaru.taskId);
        terkirim.push(`• ${tKirim.taskId} — ${plan.purpose} (${plan.sceneId})`);
      } catch (error) {
        gagalKirim += 1;
        this.konfigurasi.logger?.warn?.("asset task gagal dikirim", {
          caseId: kandidat.caseId,
          planId: plan.planId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const pesan = [
      `✅ Case dibuat: ${kandidat.metadata?.title ?? kandidat.caseId}`,
      `CaseId: \`${kandidat.caseId}\``,
      `VersionId: \`${kandidat.versionId}\``,
      ``,
      `🧩 ${terkirim.length} asset task dikirim ke grup aset${gagalKirim > 0 ? ` (${gagalKirim} gagal)` : ""}.`,
      ``,
      `Langkah berikutnya:`,
      `1) Di grup aset, balas tiap pesan [ASSET TASK] dengan gambar.`,
      `2) Verifikasi tiap task: \`\/verifytask <taskId>\``,
      `   (tolak: \`\/rejecttask <taskId> <alasan>\`)`,
      `3) Publish: \`\/publishcase ${kandidat.caseId} ${kandidat.versionId}\``,
    ].join("\n");
    await this.kirimPesanAman(chatId, pesan, { command: "/generatecase", updateId }, { parseMode: "Markdown" });
    return berhasil({ command: "/generatecase", message: pesan });
  }

  /** /publishcase <caseId> <versionId> — ADMIN: publish DRAFT setelah aset siap. */
  private async publishCaseAdmin(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
    argumen: string[],
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    if (!(await this.pastikanAdminGrup(userId, groupId, chatId, "/publishcase", updateId))) {
      return berhasil({ command: "/publishcase", message: "Perintah ini khusus admin grup." });
    }

    const caseId = argumen[0] ?? "";
    const versionId = argumen[1] ?? "";
    if (!caseId || !versionId) {
      const pesan = "Format: /publishcase <caseId> <versionId>";
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }

    const repositori = this.konfigurasi.repositoriVersiKasus;
    if (!repositori.ambilVersiKasus || !repositori.simpanVersiKasus) {
      const pesan = "Repositori versi kasus tidak tersedia untuk publikasi.";
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }

    const versi = await repositori.ambilVersiKasus(buatIdKasus(caseId), buatIdVersiKasus(versionId));
    if (!versi) {
      const pesan = `CaseVersion tidak ditemukan: ${caseId} ${versionId}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }
    if (versi.status === StatusVersiKasus.PUBLISHED) {
      const pesan = `Case ${caseId} ${versionId} sudah dipublish (idempotent).`;
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }
    if (versi.status === StatusVersiKasus.DISABLED) {
      const pesan = "CaseVersion dinonaktifkan — tidak dapat dipublish.";
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }

    const kandidatAi = versi.contentSummary.startsWith("Generated case:");
    if (kandidatAi) {
      const repoAset = this.konfigurasi.repositoriAsetVisualProduksi;
      if (!repoAset) {
        const pesan = "Repositori aset visual tidak tersedia untuk validasi.";
        await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
        return berhasil({ command: "/publishcase", message: pesan });
      }
      const manifest = await repoAset.ambilManifest(caseId);
      if (!manifest || manifest.assets.length === 0) {
        const pesan = "Aset belum lengkap — selesaikan semua asset task di grup aset lalu verifikasi sebelum publish.";
        await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
        return berhasil({ command: "/publishcase", message: pesan });
      }
      const asetTakValid = manifest.assets.find(
        (aset) => !aset.uri || aset.uri.trim() === "" || aset.status === "UNAVAILABLE" || !aset.verifiedAt,
      );
      if (asetTakValid) {
        const pesan = `Terdapat asset tanpa reference valid / belum VERIFIED (${asetTakValid.assetId}) — tidak dapat dipublish.`;
        await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
        return berhasil({ command: "/publishcase", message: pesan });
      }
    }

    try {
      const versiTerbit = publikasiVersiKasus(versi, this.konfigurasi.waktu.sekarangIso());
      await repositori.simpanVersiKasus(versiTerbit);
      const pesan = `✅ Case dipublish: ${versiTerbit.caseId} ${versiTerbit.versionId}. Sekarang /newcase bisa dipakai di grup ini.`;
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    } catch (error) {
      const pesan = `Publish gagal: ${error instanceof Error ? error.message : String(error)}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/publishcase", updateId });
      return berhasil({ command: "/publishcase", message: pesan });
    }
  }

  /** /verifytask <taskId> — ADMIN: verifikasi asset task yang sudah di-gambar. */
  private async verifyTaskAdmin(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
    argumen: string[],
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    if (!(await this.pastikanAdminGrup(userId, groupId, chatId, "/verifytask", updateId))) {
      return berhasil({ command: "/verifytask", message: "Perintah ini khusus admin grup." });
    }
    const taskId = argumen[0] ?? "";
    if (!taskId) {
      const pesan = "Format: /verifytask <taskId>";
      await this.kirimPesanAman(chatId, pesan, { command: "/verifytask", updateId });
      return berhasil({ command: "/verifytask", message: pesan });
    }
    if (!this.konfigurasi.layananTugasAset) {
      const pesan = "Layanan asset task tidak tersedia.";
      await this.kirimPesanAman(chatId, pesan, { command: "/verifytask", updateId });
      return berhasil({ command: "/verifytask", message: pesan });
    }
    try {
      const t = await this.konfigurasi.layananTugasAset.verifikasiTugasAset(taskId);
      const pesan = `✅ Task ${t.taskId} → ${t.status}.`;
      await this.kirimPesanAman(chatId, pesan, { command: "/verifytask", updateId });
      return berhasil({ command: "/verifytask", message: pesan });
    } catch (error) {
      const pesan = `Verifikasi ditolak: ${error instanceof Error ? error.message : String(error)}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/verifytask", updateId });
      return berhasil({ command: "/verifytask", message: pesan });
    }
  }

  /** /rejecttask <taskId> <alasan…> — ADMIN: tolak task, kembali menunggu admin. */
  private async rejectTaskAdmin(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
    argumen: string[],
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    if (!(await this.pastikanAdminGrup(userId, groupId, chatId, "/rejecttask", updateId))) {
      return berhasil({ command: "/rejecttask", message: "Perintah ini khusus admin grup." });
    }
    const taskId = argumen[0] ?? "";
    if (!taskId) {
      const pesan = "Format: /rejecttask <taskId> <alasan>";
      await this.kirimPesanAman(chatId, pesan, { command: "/rejecttask", updateId });
      return berhasil({ command: "/rejecttask", message: pesan });
    }
    if (!this.konfigurasi.layananTugasAset) {
      const pesan = "Layanan asset task tidak tersedia.";
      await this.kirimPesanAman(chatId, pesan, { command: "/rejecttask", updateId });
      return berhasil({ command: "/rejecttask", message: pesan });
    }
    const alasan = argumen.slice(1).join(" ").trim() || "tanpa alasan";
    try {
      const t = await this.konfigurasi.layananTugasAset.tolakTugasAset(taskId, alasan);
      const pesan = `🔁 Task ${t.taskId} ditolak → ${t.status}.`;
      await this.kirimPesanAman(chatId, pesan, { command: "/rejecttask", updateId });
      return berhasil({ command: "/rejecttask", message: pesan });
    } catch (error) {
      const pesan = `Penolakan ditolak: ${error instanceof Error ? error.message : String(error)}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/rejecttask", updateId });
      return berhasil({ command: "/rejecttask", message: pesan });
    }
  }

  /** /resendtask <taskId> — ADMIN: kirim ulang pesan task ke vault (mis. pesan lama hilang/gagal). */
  private async resendTaskAdmin(
    groupId: IdGrup,
    userId: IdPemain,
    chatId: string,
    updateId: string,
    argumen: string[],
  ): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    if (!(await this.pastikanAdminGrup(userId, groupId, chatId, "/resendtask", updateId))) {
      return berhasil({ command: "/resendtask", message: "Perintah ini khusus admin grup." });
    }
    const taskId = argumen[0] ?? "";
    if (!taskId) {
      const pesan = "Format: /resendtask <taskId>";
      await this.kirimPesanAman(chatId, pesan, { command: "/resendtask", updateId });
      return berhasil({ command: "/resendtask", message: pesan });
    }
    if (!this.konfigurasi.layananTugasAset) {
      const pesan = "Layanan asset task tidak tersedia.";
      await this.kirimPesanAman(chatId, pesan, { command: "/resendtask", updateId });
      return berhasil({ command: "/resendtask", message: pesan });
    }
    try {
      const svc = this.konfigurasi.layananTugasAset;
      const t = svc.kirimUlangTugasAset ? await svc.kirimUlangTugasAset(taskId) : await svc.kirimTugasAset(taskId);
      const pesan = `🔁 Task ${t.taskId} dikirim ulang ke vault (msg ${t.telegramMessageId ?? "-"}) → ${t.status}.`;
      await this.kirimPesanAman(chatId, pesan, { command: "/resendtask", updateId });
      return berhasil({ command: "/resendtask", message: pesan });
    } catch (error) {
      const pesan = `Resend ditolak: ${error instanceof Error ? error.message : String(error)}`;
      await this.kirimPesanAman(chatId, pesan, { command: "/resendtask", updateId });
      return berhasil({ command: "/resendtask", message: pesan });
    }
  }

  private async validasiAdmin(userId: IdPemain, groupId: IdGrup): Promise<boolean> {
    const validatorAdmin = this.konfigurasi.validasiAdminGrup;
    if (validatorAdmin) {
      return validatorAdmin(String(userId), String(groupId));
    }

    return this.konfigurasi.validasiAksesTelegram(String(userId), String(groupId));
  }
}

/** Turunkan VisualPlan[] minimal dari Case Bible agar tiap scene punya asset. */
function turunanVisualPlanDariKasus(caseBible: CaseBible): VisualPlan[] {
  const objekPerAdegan = new Map<string, CaseBible["objects"]>();
  for (const objek of caseBible.objects) {
    const daftar = objekPerAdegan.get(objek.sceneId) ?? [];
    daftar.push(objek);
    objekPerAdegan.set(objek.sceneId, daftar);
  }

  return caseBible.scenes.map((adegan) => {
    const objs = objekPerAdegan.get(adegan.sceneId) ?? [];
    const objekBerbukti = objs.filter((o) => o.evidenceId);
    const requiredClues: VisualPlan["requiredClues"] =
      objekBerbukti.length > 0
        ? objekBerbukti.map((o) => ({ id: o.evidenceId as string, label: o.name, entityId: o.objectId, kind: "object" }))
        : objs.length > 0
          ? objs.map((o) => ({ id: o.objectId, label: o.name, entityId: o.objectId, kind: "object" }))
          : [{ id: adegan.sceneId, label: adegan.name, entityId: adegan.sceneId, kind: "scene" }];

    const objekAdegan = objs.length > 0 ? ` Object di adegan: ${objs.map((o) => o.name).join("; ")}.` : "";
    const peristiwa = caseBible.timelineEvents
      .filter((e) => !e.locationId || e.locationId === adegan.sceneId)
      .map((e) => e.action);
    const narasi = peristiwa.length > 0 ? ` Kejadian: ${peristiwa.join("; ")}.` : "";

    return {
      planId: `PLAN-${adegan.sceneId}`,
      sceneId: adegan.sceneId,
      purpose: "CRIME_SCENE",
      requiredClues,
      forbiddenClues: [],
      inspectableObjects: objs.map((o) => o.objectId),
      compositionNotes: [
        `Case: ${caseBible.title}. Korban: ${caseBible.victim}. Scene: ${adegan.name}.${objekAdegan}${narasi}`,
      ],
      styleConstraints: ["no text overlays", "no letters or words in the image", "cinematic investigative lighting"],
    };
  });
}

function buatIdPemain(value: string): IdPemain {
  return value as IdPemain;
}

export function buatKomandoTelegramLayanan(konfigurasi: KonfigurasiKomandoTelegram): KomandoTelegramLayanan {
  return new KomandoTelegramLayanan(konfigurasi);
}
