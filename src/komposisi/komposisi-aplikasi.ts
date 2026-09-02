import type { Firestore } from "firebase-admin/firestore";
import { KomandoTelegramLayanan } from "../application/services/komando-telegram.js";
import type { KonfigurasiKomandoTelegram, LoggerKomandoTelegram } from "../application/services/komando-telegram.js";
import { ValidatorAdminGrupTelegram, ValidatorAksesTelegram, ValidatorGrupTelegram } from "../application/services/validasi-telegram.js";
import { SistemWaktu } from "../fondasi/waktu.js";
import type { PenyediaWaktu } from "../fondasi/waktu.js";
import { TelegramAdapter } from "../infrastructure/adapters/telegram/telegram.js";
import type { OpsiPengirimTelegram } from "../infrastructure/adapters/telegram/telegram.js";
import { buatBootstrapFirestore } from "../infrastructure/firebase/bootstrap.js";
import { PenerbitAcaraDomainFirestore } from "../infrastructure/events/penerbit-acara-domain.js";
import { RepositoriGrupFirestore } from "../infrastructure/repositories/firestore/repositori-grup.js";
import { RepositoriIdempotenFirestore } from "../infrastructure/repositories/firestore/repositori-idempoten.js";
import { RepositoriPenggunaFirestore } from "../infrastructure/repositories/firestore/repositori-pengguna.js";
import { RepositoriSesiFirestore } from "../infrastructure/repositories/firestore/repositori-sesi.js";
import { RepositoriVersiKasusFirestore } from "../infrastructure/repositories/firestore/repositori-versi-kasus.js";
import { buatLoggerStruktur, LoggerStruktur } from "../observability/logger.js";
import { PenghitungBatasKejadian } from "../security/rate-limiter.js";

/**
 * COMPOSITION ROOT — Production Wiring Patch.
 *
 * Satu-satunya tempat dependency runtime dirakit. `api/telegram.ts` hanya
 * memanggil `dapatkanKomposisiAplikasi()`; tidak ada inline stub di handler.
 *
 * Warm invocation: `dapatkanKomposisiAplikasi()` memoized instance sehingga
 * Firebase app, repositori, validator cache, dan rate limiter dipakai ulang
 * tanpa membuat koneksi berlebihan. Firebase SDK sendiri sudah menjaga
 * singleton app via getApps().
 */

export interface OpsiKomposisiAplikasi {
  /** Injeksi Firestore (test/offline smoke); default bootstrap Firebase eksplisit. */
  firestore?: Firestore;
  /** Opsi pengirim Telegram (botToken/fetchImpl/timeout) untuk test. */
  pengirimTelegram?: OpsiPengirimTelegram;
  waktu?: PenyediaWaktu;
  logger?: LoggerStruktur;
  batasRate?: { maxPermintaan: number; jendelaMs: number };
}

export interface KomposisiAplikasi {
  readonly firestore: Firestore;
  readonly repositoriVersiKasus: RepositoriVersiKasusFirestore;
  readonly repositoriSesiKasus: RepositoriSesiFirestore;
  readonly repositoriGrup: RepositoriGrupFirestore;
  readonly repositoriPengguna: RepositoriPenggunaFirestore;
  readonly repositoriIdempoten: RepositoriIdempotenFirestore;
  readonly penerbitEventDomain: PenerbitAcaraDomainFirestore;
  readonly pengirimTelegram: TelegramAdapter;
  readonly validatorGrupTelegram: ValidatorGrupTelegram;
  readonly validatorAksesTelegram: ValidatorAksesTelegram;
  readonly validatorAdminGrupTelegram: ValidatorAdminGrupTelegram;
  readonly penghitungBatasKejadian: PenghitungBatasKejadian;
  readonly waktu: PenyediaWaktu;
  readonly logger: LoggerKomandoTelegram;
  readonly layananKomando: KomandoTelegramLayanan;
}

export function buatKomposisiAplikasi(opsi: OpsiKomposisiAplikasi = {}): KomposisiAplikasi {
  const logger = opsi.logger ?? buatLoggerStruktur(process.env.LOG_LEVEL === "debug" ? "debug" : "info");
  const waktu = opsi.waktu ?? new SistemWaktu();

  // Firebase/Firestore — credential eksplisit dari env (Vercel) atau ADC.
  const firestore = opsi.firestore ?? buatBootstrapFirestore().firestore;

  // Repositori Firestore (collection naming sesuai persistence contract).
  const repositoriVersiKasus = new RepositoriVersiKasusFirestore(firestore);
  const repositoriSesiKasus = new RepositoriSesiFirestore(firestore);
  const repositoriGrup = new RepositoriGrupFirestore(firestore);
  const repositoriPengguna = new RepositoriPenggunaFirestore(firestore);
  const repositoriIdempoten = new RepositoriIdempotenFirestore(firestore);

  // Event persistence (case_sessions/{sessionId}/events/{eventId}).
  const penerbitEventDomain = new PenerbitAcaraDomainFirestore(firestore, logger);

  // Telegram sender/adapter (sendMessage + getChatMember).
  const pengirimTelegram = new TelegramAdapter(opsi.pengirimTelegram ?? {});

  // Validasi grup/akses/admin — bukan lagi return true.
  const validatorGrupTelegram = new ValidatorGrupTelegram(repositoriGrup, waktu);
  const validatorAksesTelegram = new ValidatorAksesTelegram(pengirimTelegram);
  const validatorAdminGrupTelegram = new ValidatorAdminGrupTelegram(pengirimTelegram);

  const batasRate = opsi.batasRate ?? {
    maxPermintaan: Number(process.env.RATE_LIMIT_MAX_ACTIONS ?? "30"),
    jendelaMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60") * 1000,
  };
  const penghitungBatasKejadian = new PenghitungBatasKejadian(batasRate);

  const konfigurasiLayanan: KonfigurasiKomandoTelegram = {
    repositoriVersiKasus: {
      ambilVersiKasusTerbitan: () => repositoriVersiKasus.ambilVersiKasusTerbitan(),
    },
    repositoriSesiKasus,
    repositoriGrup,
    penerbitEventDomain,
    kontrakIdempoten: repositoriIdempoten,
    waktu,
    kirimPesanTelegram: (chatId, pesan) => pengirimTelegram.kirimPesanTelegram(chatId, pesan),
    validasiAksesTelegram: (userId, chatId) => validatorAksesTelegram.validasi(userId, chatId),
    validasiGroupTelegram: (chatId) => validatorGrupTelegram.validasi(chatId),
    validasiAdminGrup: (userId, chatId) => validatorAdminGrupTelegram.validasi(userId, chatId),
    logger,
  };

  const layananKomando = new KomandoTelegramLayanan(konfigurasiLayanan);

  return {
    firestore,
    repositoriVersiKasus,
    repositoriSesiKasus,
    repositoriGrup,
    repositoriPengguna,
    repositoriIdempoten,
    penerbitEventDomain,
    pengirimTelegram,
    validatorGrupTelegram,
    validatorAksesTelegram,
    validatorAdminGrupTelegram,
    penghitungBatasKejadian,
    waktu,
    logger,
    layananKomando,
  };
}

let komposisiAktif: KomposisiAplikasi | undefined;

/** Lazy memoized composition — dipakai ulang pada warm invocation. */
export function dapatkanKomposisiAplikasi(opsi: OpsiKomposisiAplikasi = {}): KomposisiAplikasi {
  if (!komposisiAktif) {
    komposisiAktif = buatKomposisiAplikasi(opsi);
  }
  return komposisiAktif;
}

/** Hanya untuk test: buang instance memoized. */
export function aturUlangKomposisiAplikasi(): void {
  komposisiAktif = undefined;
}