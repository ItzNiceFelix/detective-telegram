import type { Transaction } from "firebase-admin/firestore";
import { StatusSesi, JenisKejadianDomain } from "../../domain/enums.js";
import type { Grup, SesiKasus } from "../../domain/entities.js";
import type { KejadianDomain, KontrakIdempoten } from "../../event/domain.js";
import { KesalahanAutorisasi, KesalahanIdempoten, KesalahanValidasi } from "../../fondasi/eror.js";
import { berhasil, gagal, type HasilOperasi } from "../../fondasi/hasil.js";
import { buatIdGrup, buatIdSesiKasus, type IdEvent, type IdGrup, type IdKasus, type IdPemain, type IdSesiKasus, type IdVersiKasus, type WaktuIso } from "../../fondasi/primitif.js";
import type { VersiKasus } from "../../kasus/versi-kasus.js";
import { StatusVersiKasus } from "../../kasus/versi-kasus.js";
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
  ambil(groupId: IdGrup): Promise<Grup | null>;
  simpan(grup: Grup): Promise<Grup>;
}

export interface PenerbitEventTelegram {
  kirim(event: KejadianDomain): Promise<void>;
}

export interface PenyediaWaktuTelegram {
  sekarangIso(): WaktuIso;
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
}

export interface HasilPerintahTelegram {
  command: string;
  message: string;
  session?: SesiKasus;
}

export class KomandoTelegramLayanan {
  constructor(private readonly konfigurasi: KonfigurasiKomandoTelegram) {}

  async prosesUpdate(permintaan: PermintaanTelegram): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
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
      let command: string | undefined;
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
          return berhasil({ command, message: "Selamat datang. Gunakan /newcase di grup untuk memulai sesi." });
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
        return berhasil({ command, message: "Bot aktif. Gunakan /newcase untuk membuat sesi baru, lalu /startcase untuk memulai." });
      }

      if (command === "/newcase") {
        return this.buatSesiBaru(groupId, userId, permintaan.updateId);
      }

      if (command === "/startcase") {
        return this.mulaiSesiAktif(groupId, userId, permintaan.updateId);
      }

      if (command === "/status") {
        return this.tampilkanStatus(groupId);
      }

      return gagal(new KesalahanValidasi("Perintah tidak didukung."));
    } catch (error) {
      if (error instanceof Error) {
        return gagal(error);
      }
      return gagal(new KesalahanValidasi("Gagal memproses perintah Telegram."));
    }
  }

  private async buatSesiBaru(groupId: IdGrup, userId: IdPemain, updateId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const grup = await this.konfigurasi.repositoriGrup.ambil(groupId);
    if (!grup) {
      return gagal(new KesalahanValidasi("Grup tidak ditemukan."));
    }

    const sesiAktif = await this.ambilSesiAktifGrup(groupId);
    if (sesiAktif) {
      return gagal(new KesalahanValidasi("Sudah ada sesi aktif untuk grup ini."));
    }

    const versi = await this.ambilVersiTerbitan();
    if (!versi) {
      return gagal(new KesalahanValidasi("Tidak ada CaseVersion published yang tersedia."));
    }

    const sessionIdBaru = buatIdSesiKasus(`${String(groupId)}:${String(versi.caseId)}:${updateId}`) as IdSesiKasus;
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
      updatedAt: this.konfigurasi.waktu.sekarangIso(),
      unlockedStatementIds: [],
      discoveredContradictionIds: [],
      knownTimelineEventIds: [],
    };

    const sesiDisimpan = await this.konfigurasi.repositoriSesiKasus.transaksi(async (transaction) => {
      const sesiAda = await this.konfigurasi.repositoriSesiKasus.ambil(sessionIdBaru, transaction);
      if (sesiAda) {
        throw new KesalahanIdempoten("Duplicate command: sesi sudah dibuat.");
      }

      const kunci = await this.konfigurasi.kontrakIdempoten.ambilKunci(updateId, sessionIdBaru, transaction);
      if (kunci) {
        throw new KesalahanIdempoten("Duplicate Telegram update telah diproses.");
      }

      await this.konfigurasi.repositoriSesiKasus.simpan(sesiBaru, transaction);
      await this.konfigurasi.kontrakIdempoten.simpanKunci(
        {
          actionId: updateId,
          sessionId: sessionIdBaru,
          repeated: false,
        },
        transaction,
      );

      return sesiBaru;
    });

    const event: KejadianDomain = {
      eventId: `evt-${Date.now()}` as unknown as IdEvent,
      eventVersion: 1,
      sessionId: sesiDisimpan.sessionId as IdSesiKasus,
      groupId,
      actorUserId: userId,
      type: "CASE_SESSION_CREATED" as any,
      payload: {
        caseId: String(versi.caseId),
        caseVersionId: String(versi.versionId),
        createdBy: String(userId),
      },
      actionId: updateId,
      occurredAt: this.konfigurasi.waktu.sekarangIso(),
    };

    await this.konfigurasi.penerbitEventDomain.kirim(event);

    const briefing = `Sesi kasus baru dibuat. Case: ${versi.metadata.title}. Status: LOBBY. Gunakan /startcase untuk memulai.`;
    await this.konfigurasi.kirimPesanTelegram(String(grup.telegramChatId), briefing);

    return berhasil({ command: "/newcase", message: briefing, session: sesiDisimpan });
  }

  private async mulaiSesiAktif(groupId: IdGrup, userId: IdPemain, updateId: string): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const sesi = await this.ambilSesiAktifGrup(groupId);
    if (!sesi) {
      return gagal(new KesalahanValidasi("Tidak ada sesi aktif untuk grup ini."));
    }

    if (sesi.status !== StatusSesi.LOBBY) {
      return gagal(new KesalahanValidasi("Sesi tidak berada di status LOBBY."));
    }

    const aksesValid = await this.konfigurasi.validasiAksesTelegram(String(userId), String(groupId));
    if (!aksesValid) {
      return gagal(new KesalahanAutorisasi("Anda tidak memiliki hak untuk memulai case."));
    }

    const sesiMulai = await this.konfigurasi.repositoriSesiKasus.transaksi(async (transaction) => {
      const sesiSaatIni = await this.konfigurasi.repositoriSesiKasus.ambil(sesi.sessionId as IdSesiKasus, transaction);
      if (!sesiSaatIni || sesiSaatIni.status !== StatusSesi.LOBBY) {
        throw new KesalahanValidasi("Sesi tidak bisa dimulai pada status saat ini.");
      }

      const kunci = await this.konfigurasi.kontrakIdempoten.ambilKunci(updateId, sesiSaatIni.sessionId as IdSesiKasus, transaction);
      if (kunci) {
        throw new KesalahanIdempoten("Duplicate Telegram update untuk startcase sudah diproses.");
      }

      const sesiDibuka: SesiKasus = {
        ...sesiSaatIni,
        status: StatusSesi.OPEN,
        startedAt: this.konfigurasi.waktu.sekarangIso(),
        lastActivityAt: this.konfigurasi.waktu.sekarangIso(),
        updatedAt: this.konfigurasi.waktu.sekarangIso(),
      };

      await this.konfigurasi.repositoriSesiKasus.simpan(sesiDibuka, transaction);
      await this.konfigurasi.kontrakIdempoten.simpanKunci(
        {
          actionId: updateId,
          sessionId: sesiDibuka.sessionId as IdSesiKasus,
          repeated: false,
        },
        transaction,
      );

      return sesiDibuka;
    });

    const event: KejadianDomain = {
      eventId: `evt-${Date.now()}` as unknown as IdEvent,
      eventVersion: 1,
      sessionId: sesiMulai.sessionId as IdSesiKasus,
      groupId,
      actorUserId: userId,
      type: "CASE_STARTED" as any,
      payload: {
        caseId: String(sesiMulai.caseId),
        caseVersionId: String(sesiMulai.caseVersionId),
        startedBy: String(userId),
      },
      actionId: updateId,
      occurredAt: this.konfigurasi.waktu.sekarangIso(),
    };

    await this.konfigurasi.penerbitEventDomain.kirim(event);

    const pesan = "Case dimulai. Status: OPEN. Tim bisa mulai investigasi.";
    await this.konfigurasi.kirimPesanTelegram(String(groupId), pesan);

    return berhasil({ command: "/startcase", message: pesan, session: sesiMulai });
  }

  private async tampilkanStatus(groupId: IdGrup): Promise<HasilOperasi<HasilPerintahTelegram, Error>> {
    const sesi = await this.ambilSesiAktifGrup(groupId);
    if (!sesi) {
      return berhasil({ command: "/status", message: "Tidak ada sesi aktif untuk grup ini." });
    }

    const statusEfektif = sesi.status === StatusSesi.PAUSED ? "PAUSED" : sesi.status === StatusSesi.CLEARED ? "CLEARED" : sesi.status === StatusSesi.ARCHIVED ? "ARCHIVED" : "ACTIVE";
    const pesan = `Status sesi: ${sesi.status} (${statusEfektif}). Progress: ${sesi.discoveredEvidenceIds.length} bukti ditemukan, ${sesi.playerIds.length} pemain.`;
    return berhasil({ command: "/status", message: pesan, session: sesi });
  }

  private async ambilSesiAktifGrup(groupId: IdGrup): Promise<SesiKasus | null> {
    const grup = await this.konfigurasi.repositoriGrup.ambil(groupId);
    if (!grup || !grup.activeCaseSessionId) {
      return null;
    }

    return this.konfigurasi.repositoriSesiKasus.ambil(grup.activeCaseSessionId as IdSesiKasus);
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
}

function buatIdPemain(value: string): IdPemain {
  return value as IdPemain;
}

export function buatKomandoTelegramLayanan(konfigurasi: KonfigurasiKomandoTelegram): KomandoTelegramLayanan {
  return new KomandoTelegramLayanan(konfigurasi);
}
