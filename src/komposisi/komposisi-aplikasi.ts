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
import { RepositoriKontribusiFirestore } from "../infrastructure/repositories/firestore/repositori-kontribusi.js";
import { RepositoriSnapshotResolusiFirestore } from "../infrastructure/repositories/firestore/repositori-snapshot-resolusi.js";
import { LayananInvestigasiKasus, buatLayananInvestigasiKasus } from "../application/services/investigasi-kasus.js";
import { LayananInterogasiKasus, buatLayananInterogasiKasus } from "../application/services/interogasi-kasus.js";
import { LayananResolusiKasus, buatLayananResolusiKasus } from "../application/services/resolusi-kasus.js";
import { RendererNaratifDeterministik, RendererNaratifAi } from "../domain/services/renderer-naratif.js";
import { RepositoriCaseBibleStatis, type KontrakRepositoriCaseBible } from "../kasus/case-bible-repository.js";
import { goldenCaseBible } from "../kasus/fixtures/golden-case.js";
import { buatLoggerStruktur, LoggerStruktur } from "../observability/logger.js";
import { PenghitungBatasKejadian } from "../security/rate-limiter.js";
import { bacaKonfigurasiAi, type KonfigurasiAi } from "../ai/konfigurasi.js";
import { GeminiTextProvider } from "../infrastructure/adapters/ai/gemini-text.js";
import { GeminiImageProvider } from "../infrastructure/adapters/ai/gemini-image.js";
import type { PintuAi } from "../ai/contracts.js";
import type { KontrakPenyediaGambar, KontrakPenyimpananGambar } from "../ai/visual-pipeline.js";
import { RepositoriAsetVisualFirestore } from "../infrastructure/repositories/firestore/repositori-aset-visual.js";
import { LayananProduksiKasus } from "../application/services/layanan-produksi-kasus.js";
import { PenyimpananGambarFirebase } from "../infrastructure/adapters/storage/penyimpanan-gambar-firebase.js";

/**
 * COMPOSITION ROOT â€” Production Wiring Patch.
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
  /** Injeksi Case Bible repository (test dapat memakai fixture khusus). */
  repositoriCaseBible?: KontrakRepositoriCaseBible;
  waktu?: PenyediaWaktu;
  logger?: LoggerStruktur;
  batasRate?: { maxPermintaan: number; jendelaMs: number };
  /** AI integration v1 â€” injeksi untuk test / penyedia kustom. */
  konfigurasiAi?: KonfigurasiAi;
  penyediaTeks?: PintuAi | undefined;
  penyediaGambar?: KontrakPenyediaGambar | undefined;
  penyimpananGambar?: KontrakPenyimpananGambar | undefined;
}

export interface KomposisiAplikasi {
  readonly firestore: Firestore;
  readonly repositoriVersiKasus: RepositoriVersiKasusFirestore;
  readonly repositoriSesiKasus: RepositoriSesiFirestore;
  readonly repositoriGrup: RepositoriGrupFirestore;
  readonly repositoriPengguna: RepositoriPenggunaFirestore;
  readonly repositoriIdempoten: RepositoriIdempotenFirestore;
  readonly repositoriCaseBible: KontrakRepositoriCaseBible;
  readonly repositoriKontribusi: RepositoriKontribusiFirestore;
  readonly repositoriSnapshotResolusi: RepositoriSnapshotResolusiFirestore;
  readonly penerbitEventDomain: PenerbitAcaraDomainFirestore;
  readonly pengirimTelegram: TelegramAdapter;
  readonly validatorGrupTelegram: ValidatorGrupTelegram;
  readonly validatorAksesTelegram: ValidatorAksesTelegram;
  readonly validatorAdminGrupTelegram: ValidatorAdminGrupTelegram;
  readonly penghitungBatasKejadian: PenghitungBatasKejadian;
  readonly waktu: PenyediaWaktu;
  readonly logger: LoggerKomandoTelegram;
  readonly layananInvestigasi: LayananInvestigasiKasus;
  readonly layananInterogasi: LayananInterogasiKasus;
  readonly layananResolusi: LayananResolusiKasus;
  readonly layananKomando: KomandoTelegramLayanan;
  // AI integration v1
  readonly konfigurasiAi: KonfigurasiAi;
  readonly penyediaTeks?: PintuAi | undefined;
  readonly penyediaGambar?: KontrakPenyediaGambar | undefined;
  readonly penyimpananGambar?: KontrakPenyimpananGambar | undefined;
  readonly repositoriAsetVisual: RepositoriAsetVisualFirestore;
  readonly layananProduksiKasus: LayananProduksiKasus;
}

export function buatKomposisiAplikasi(opsi: OpsiKomposisiAplikasi = {}): KomposisiAplikasi {
  const logger = opsi.logger ?? buatLoggerStruktur(process.env.LOG_LEVEL === "debug" ? "debug" : "info");
  const waktu = opsi.waktu ?? new SistemWaktu();

  // Firebase/Firestore â€” credential eksplisit dari env (Vercel) atau ADC.
  const firestore = opsi.firestore ?? buatBootstrapFirestore().firestore;

  // Repositori Firestore (collection naming sesuai persistence contract).
  const repositoriVersiKasus = new RepositoriVersiKasusFirestore(firestore);
  const repositoriSesiKasus = new RepositoriSesiFirestore(firestore);
  const repositoriGrup = new RepositoriGrupFirestore(firestore);
  const repositoriPengguna = new RepositoriPenggunaFirestore(firestore);
  const repositoriIdempoten = new RepositoriIdempotenFirestore(firestore);
  const repositoriKontribusi = new RepositoriKontribusiFirestore(firestore);
  const repositoriSnapshotResolusi = new RepositoriSnapshotResolusiFirestore(firestore);

  // Event persistence (case_sessions/{sessionId}/events/{eventId}).
  const penerbitEventDomain = new PenerbitAcaraDomainFirestore(firestore, logger);

  // Case Bible. Default produksi: Golden Case fixture yang di-remap agar ref
  // cocok dengan konvensi `case-bible:{caseId}:golden` yang dipakai domain
  // services (caseId "CASE-001" â†’ ref "case-bible:CASE-001:golden").
  const repositoriCaseBible = opsi.repositoriCaseBible ?? new RepositoriCaseBibleStatis([
    { ...goldenCaseBible, caseBibleRef: `case-bible:${String(goldenCaseBible.caseId)}:golden` },
  ]);
  // ===== AI integration v1 (admin/offline; runtime narrative DISABLED default) =====
  // Provider & model TIDAK pernah di-hardcode di domain; seluruhnya dari config/env.
  const konfigurasiAi = opsi.konfigurasiAi ?? bacaKonfigurasiAi(process.env);
  const penyediaTeks = opsi.penyediaTeks ?? (
    konfigurasiAi.textReady
      ? (() => {
          const opsiTeks: { apiKey: string; model: string; timeoutMs: number; maxRetries: number; maxOutputTokens: number; apiBase?: string } = {
            apiKey: konfigurasiAi.geminiApiKey as string,
            model: konfigurasiAi.textModel,
            timeoutMs: konfigurasiAi.timeoutMs,
            maxRetries: konfigurasiAi.maxRetries,
            maxOutputTokens: konfigurasiAi.maxOutputTokens,
          };
          if (process.env.GEMINI_API_BASE) opsiTeks.apiBase = process.env.GEMINI_API_BASE;
          return new GeminiTextProvider(opsiTeks);
        })()
      : undefined
  );
  const penyediaGambar = opsi.penyediaGambar ?? (
    konfigurasiAi.imageReady
      ? (() => {
          const opsiGambar: { apiKey: string; model: string; timeoutMs: number; maxRetries: number; maxOutputTokens: number; apiBase?: string } = {
            apiKey: konfigurasiAi.geminiApiKey as string,
            model: konfigurasiAi.imageModel,
            timeoutMs: konfigurasiAi.timeoutMs,
            maxRetries: konfigurasiAi.maxRetries,
            maxOutputTokens: konfigurasiAi.maxOutputTokens,
          };
          if (process.env.GEMINI_API_BASE) opsiGambar.apiBase = process.env.GEMINI_API_BASE;
          return new GeminiImageProvider(opsiGambar);
        })()
      : undefined
  );

  // Runtime narrative: production default deterministik. Boundary: bila AI
  // runtime narrative diaktifkan (false default) + provider tersedia, pakai
  // RendererNaratifAi (fallback deterministik) â€” domain tidak tahu provider.
  const rendererNaratif = (konfigurasiAi.runtimeNarrativeEnabled && penyediaTeks)
    ? new RendererNaratifAi(penyediaTeks, new RendererNaratifDeterministik())
    : new RendererNaratifDeterministik();

  // Asset visual DURABLE (metadata/ref, bukan binary) â€” reused lintas replay.
  const repositoriAsetVisual = new RepositoriAsetVisualFirestore(firestore);

  // Object storage binary image durable (Firebase Storage). Lazy — hanya dipakai
  // ketika image generation AI aktif; test dapat menyuntik fake storage.
  const penyimpananGambar = opsi.penyimpananGambar ?? (konfigurasiAi.imageReady ? new PenyimpananGambarFirebase() : undefined);

  // Telegram sender/adapter (sendMessage + getChatMember).
  const pengirimTelegram = new TelegramAdapter(opsi.pengirimTelegram ?? {});

  // Validasi grup/akses/admin â€” bukan lagi return true.
  const validatorGrupTelegram = new ValidatorGrupTelegram(repositoriGrup, waktu);
  const validatorAksesTelegram = new ValidatorAksesTelegram(pengirimTelegram);
  const validatorAdminGrupTelegram = new ValidatorAdminGrupTelegram(pengirimTelegram);

  const batasRate = opsi.batasRate ?? {
    maxPermintaan: Number(process.env.RATE_LIMIT_MAX_ACTIONS ?? "30"),
    jendelaMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60") * 1000,
  };
  const penghitungBatasKejadian = new PenghitungBatasKejadian(batasRate);

  const layananInvestigasi = buatLayananInvestigasiKasus({
    repositoriSesi: repositoriSesiKasus,
    repositoriCaseBible,
    penerbitEventDomain,
    waktu,
  });

  const layananInterogasi = buatLayananInterogasiKasus({
    repositoriSesi: repositoriSesiKasus,
    repositoriCaseBible,
    penerbitEventDomain,
    waktu,
    renderer: rendererNaratif,
  });

  const layananResolusi = buatLayananResolusiKasus({
    repositoriSesi: repositoriSesiKasus,
    repositoriCaseBible,
    repositoriKontribusi,
    repositoriSnapshot: repositoriSnapshotResolusi,
    penerbitEventDomain,
    waktu,
  });

  const layananProduksiKasus = new LayananProduksiKasus({
    konfigurasi: {
      caseGenerationEnabled: konfigurasiAi.caseGenerationEnabled,
      penyediaTeks,
      penyediaGambar,
      penyimpananGambar,
      providerName: konfigurasiAi.provider,
      opsiGenerasi: {
        maxRetries: konfigurasiAi.maxRetries,
        provider: konfigurasiAi.provider,
        model: konfigurasiAi.textModel,
      },
    },
    repositoriVersi: {
      simpanVersiKasus: (versi) => repositoriVersiKasus.simpanVersiKasus(versi),
    },
    repositoriAset: repositoriAsetVisual,
  });

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
    repositoriCaseBible,
    layananInvestigasi,
    layananInterogasi,
    layananResolusi,
    rendererNaratif,
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
    repositoriCaseBible,
    repositoriKontribusi,
    repositoriSnapshotResolusi,
    penerbitEventDomain,
    pengirimTelegram,
    validatorGrupTelegram,
    validatorAksesTelegram,
    validatorAdminGrupTelegram,
    penghitungBatasKejadian,
    waktu,
    logger,
    layananInvestigasi,
    layananInterogasi,
    layananResolusi,
    layananKomando,
konfigurasiAi,
    penyediaTeks,
    penyediaGambar,
    penyimpananGambar,
    repositoriAsetVisual,
    layananProduksiKasus,
  };
}

let komposisiAktif: KomposisiAplikasi | undefined;

/** Lazy memoized composition â€” dipakai ulang pada warm invocation. */
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