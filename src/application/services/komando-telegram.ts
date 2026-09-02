import type { Transaction } from "firebase-admin/firestore";
import { StatusSesi, JenisKejadianDomain } from "../../domain/enums.js";
import type { Grup, SesiKasus } from "../../domain/entities.js";
import { validasiTransisiSesi, mulaiSesi } from "../../domain/services/transisi-sesi.js";
import type { KejadianDomain, KontrakIdempoten } from "../../event/domain.js";
import { KesalahanAutorisasi, KesalahanIdempoten, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import { buatIdEvent, buatIdGrup, buatIdSesiKasus, type IdEvent, type IdGrup, type IdKasus, type IdPemain, type IdSesiKasus, type IdVersiKasus, type WaktuIso } from "../../fondasi/primitif.js";
import type { VersiKasus } from "../../kasus/versi-kasus.js";
import type { PermintaanTelegram } from "../../infrastructure/adapters/telegram/telegram.js";

export interface RepositoriVersiKasusTelegram {
  ambilVersiKasus?: (caseId?: IdKasus, versionId?: IdVersiKasus) => Promise<VersiKasus | null>;
  ambilVersiKasusTerbitan?: () => Promise<VersiKasus | null>;
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
  kirimPesanTelegram: (chatId: string, message: string) => Promise<void>;
  validasiAksesTelegram: (userId: string, groupId: string) => Promise<boolean>;
  validasiGroupTelegram: (chatId: string) => Promise<boolean>;
  /** /startcase: admin grup. Default fallback: validasiAksesTelegram. */
  validasiAdminGrup?: (userId: string, chatId: string) => Promise<boolean>;
  logger?: LoggerKomandoTelegram;
}

export interface HasilPerintahTelegram {
  command: string;
  message: string;
  session?: SesiKasus;
}

/** Satu sesi non-terminal per grup (docs/26.1): LOBBY/OPEN/PAUSED. */
const STATUS_SESI_NON_TERMINAL: ReadonlyArray<StatusSesi> = [StatusSesi.LOBBY, StatusSesi.OPEN, StatusSesi.PAUSED];

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
        command = permintaan.command.toLowerCase();
      } else {
        const rawText = typeof permintaan.text === "string" ? permintaan.text : "";
        const token = rawText.trim().split(/\s+/)[0] ?? "";
        if (token.startsWith("/")) {
          command = token.toLowerCase();
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
  private async kirimPesanAman(chatId: string, pesan: string, korelasi: { command: string; updateId: string; sessionId?: string }): Promise<void> {
  console.log(JSON.stringify({ debug: "mencoba_kirim", chatId, pesanPanjang: pesan.length, ...korelasi }));
  try {
    await this.konfigurasi.kirimPesanTelegram(chatId, pesan);
    console.log(JSON.stringify({ debug: "kirim_sukses", chatId }));
  } catch (error) {
    console.log(JSON.stringify({
      debug: "kirim_gagal",
      ...korelasi,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    }));
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

function buatIdPemain(value: string): IdPemain {
  return value as IdPemain;
}

export function buatKomandoTelegramLayanan(konfigurasi: KonfigurasiKomandoTelegram): KomandoTelegramLayanan {
  return new KomandoTelegramLayanan(konfigurasi);
}
