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
import { RepositoriCaseBibleFirestore, RepositoriCaseBibleGabungan } from "../infrastructure/repositories/firestore/repositori-case-bible.js";
import { goldenCaseBible } from "../kasus/fixtures/golden-case.js";
import { buatLoggerStruktur, LoggerStruktur } from "../observability/logger.js";
import { PenghitungBatasKejadian } from "../security/rate-limiter.js";
import { bacaKonfigurasiAi, type KonfigurasiAi } from "../ai/konfigurasi.js";
import { GeminiImageProvider } from "../infrastructure/adapters/ai/gemini-image.js";
import { RouterAi } from "../infrastructure/adapters/ai/router-ai.js";
import { RepositoriKonfigurasiAiFirestore } from "../infrastructure/repositories/firestore/repositori-konfigurasi-ai.js";
import type { PintuAi } from "../ai/contracts.js";
import type { KontrakPenyediaGambar, KontrakPenyimpananGambar } from "../ai/visual-pipeline.js";
import { RepositoriAsetVisualFirestore } from "../infrastructure/repositories/firestore/repositori-aset-visual.js";
import { LayananProduksiKasus } from "../application/services/layanan-produksi-kasus.js";
import { PenyimpananGambarFirebase } from "../infrastructure/adapters/storage/penyimpanan-gambar-firebase.js";
import { PenyimpananAsetTelegram } from "../infrastructure/adapters/storage/penyimpanan-aset-telegram.js";
import { RepositoriTugasAsetFirestore } from "../infrastructure/repositories/firestore/repositori-tugas-aset.js";
import { LayananTugasAset } from "../application/services/layanan-tugas-aset.js";
import { KesalahanKonfigurasi } from "../fondasi/eror.js";

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
  routerTtlMs?: number;
  /** Chat vault asset (test overrides). Default: env TELEGRAM_ASSET_VAULT_CHAT_ID. */
  vaultChatId?: string | undefined;
  /** Validasi admin vault (test overrides). Default: getChatMember creator/admin. */
  validasiAdminVault?: (userId: string, chatId: string) => Promise<boolean> | undefined;
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
  // AI integration v1 + runtime routing (Firestore)
  readonly konfigurasiAi: KonfigurasiAi;
  readonly routerAi: RouterAi;
  readonly repositoriKonfigurasiAi: RepositoriKonfigurasiAiFirestore;
  readonly penyediaTeks?: PintuAi | undefined;
  readonly penyediaGambar?: KontrakPenyediaGambar | undefined;
  readonly penyimpananGambar?: KontrakPenyimpananGambar | undefined;
  readonly repositoriAsetVisual: RepositoriAsetVisualFirestore;
  readonly layananProduksiKasus: LayananProduksiKasus;
  // AssetTask Human-in-the-Loop (Beta)
  readonly repositoriTugasAset: RepositoriTugasAsetFirestore;
  readonly layananTugasAset: LayananTugasAset;
}

/**
 * Boolean env opsional untuk flag AI (opsional/gagal-aman).
 * AI_COUNT_TOKENS_ENABLED — aktifkan preflight countTokens (default false).
 */
function bacaBooleanEnv(kunci: string): boolean {
  const raw = (process.env[kunci] ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Pilih penyimpanan gambar binary — configuration-driven (docs/ASSET-STORAGE-DECISION.md).
 * ASSET_STORAGE_PROVIDER=TELEGRAM_BETA -> Telegram Asset Vault (BEST_EFFORT, beta).
 * default/FIREBASE_STORAGE -> PenyimpananGambarFirebase (canonical future).
 */
function bangunPenyimpananGambar(
  konfigurasiAi: KonfigurasiAi,
  env: Record<string, string | undefined>,
  pengirimTelegram: TelegramAdapter,
): KontrakPenyimpananGambar | undefined {
  if (!konfigurasiAi.imageReady) return undefined;
  const mode = (env.ASSET_STORAGE_PROVIDER ?? "FIREBASE_STORAGE").trim().toUpperCase();
  if (mode === "TELEGRAM_BETA" || mode === "TELEGRAM") {
    const chatId = (env.TELEGRAM_ASSET_VAULT_CHAT_ID ?? "").trim();
    if (!chatId) {
      throw new KesalahanKonfigurasi(
        "ASSET_STORAGE_PROVIDER=TELEGRAM_BETA membutuhkan TELEGRAM_ASSET_VAULT_CHAT_ID (private channel vault).",
      );
    }
    return new PenyimpananAsetTelegram({ chatId, telegram: pengirimTelegram });
  }
  return new PenyimpananGambarFirebase();
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
  // Bible AI hasil generate tersimpan di Firestore `case_bibles/{ref}`;
  // gabungan statis→firestore agar SEMUA command playable untuk case
  // golden maupun AI (golden = first gameplay, AI = case produksi).
  const repositoriCaseBibleStatis = opsi.repositoriCaseBible ?? new RepositoriCaseBibleStatis([
    { ...goldenCaseBible, caseBibleRef: `case-bible:${String(goldenCaseBible.caseId)}:golden` },
  ]);
  const repositoriCaseBibleFirestore = new RepositoriCaseBibleFirestore(firestore);
  const repositoriCaseBible = new RepositoriCaseBibleGabungan(repositoriCaseBibleStatis, repositoriCaseBibleFirestore);
  // ===== AI runtime config (Firestore, tanpa redeploy) =====
  // Sumber runtime: ai_runtime_config/production. Kredensial TETAP dari env
  // server (GEMINI_API_KEY / future XKIRO_API_KEY / BITDEER_API_KEY).
  // Tanpa dokumen Firestore / baca gagal → default dari env (behavior lama).
  const konfigurasiAi = opsi.konfigurasiAi ?? bacaKonfigurasiAi(process.env);
  const repositoriKonfigurasiAi = new RepositoriKonfigurasiAiFirestore(firestore);
  const routerAi = new RouterAi({
    sumber: repositoriKonfigurasiAi,
    defaultsEnv: {
      provider: konfigurasiAi.provider,
      textModel: konfigurasiAi.textModel,
      timeoutMs: konfigurasiAi.timeoutMs,
      maxRetries: konfigurasiAi.maxRetries,
      maxOutputTokens: konfigurasiAi.maxOutputTokens,
      textReady: konfigurasiAi.textReady,
      imageReady: konfigurasiAi.imageReady,
      caseGenerationEnabled: konfigurasiAi.caseGenerationEnabled,
      runtimeNarrativeEnabled: konfigurasiAi.runtimeNarrativeEnabled,
      assistantEnabled: konfigurasiAi.assistantEnabled,
    },
    kunci: {
      geminiApiKey: konfigurasiAi.geminiApiKey,
      xkiroApiKey: (process.env.XKIRO_API_KEY ?? "").trim() || undefined,
      bitdeerApiKey: (process.env.BITDEER_API_KEY ?? "").trim() || undefined,
    },
    logger,
    countTokensEnabled: bacaBooleanEnv("AI_COUNT_TOKENS_ENABLED"),
    ...(opsi.routerTtlMs !== undefined ? { ttlMs: opsi.routerTtlMs } : {}),
  });
  // penyediaTeks = Router (Application → Router → Provider Adapter).
  // Injeksi eksplisit (test/penyedia kustom) tetap dihormati.
  const penyediaTeks = opsi.penyediaTeks ?? routerAi;
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

  // Telegram sender/adapter (sendMessage + getChatMember + sendPhoto).
  const pengirimTelegram = new TelegramAdapter(opsi.pengirimTelegram ?? {});

  // Penyimpanan gambar (binary) — configuration-driven (ASSET-STORAGE-DECISION.md).
  // ASSET_STORAGE_PROVIDER=TELEGRAM_BETA -> Telegram Asset Vault (BEST_EFFORT, beta).
  // default/firebase -> PenyimpananGambarFirebase (canonical future).
  const penyimpananGambar = opsi.penyimpananGambar ?? bangunPenyimpananGambar(konfigurasiAi, process.env, pengirimTelegram);

  // AssetTask Human-in-the-Loop (Beta) — docs/AI-IMAGE-HUMAN-IN-LOOP-DECISION.md.
  const repositoriTugasAset = new RepositoriTugasAsetFirestore(firestore);
  const vaultChatId = (opsi.vaultChatId ?? (process.env.TELEGRAM_ASSET_VAULT_CHAT_ID ?? "").trim()) || undefined;
  const validasiAdminVault: (userId: string, chatId: string) => Promise<boolean> =
    (opsi.validasiAdminVault ??
      (async (userId: string, chatId: string): Promise<boolean> => {
        const status = await pengirimTelegram.ambilStatusAnggota(chatId, userId);
        return status === "creator" || status === "administrator";
      })) as (userId: string, chatId: string) => Promise<boolean>;
  const layananTugasAset = new LayananTugasAset({
    repositoriTugas: repositoriTugasAset,
    repositoriAset: repositoriAsetVisual,
    vaultChatId,
    waktu,
    pembuatIdTugas: () => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kirimPesan: (chatId, text, opsi) => pengirimTelegram.kirimPesanTelegram(chatId, text, opsi),
    validasiAdminVault,
  });


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
    repositoriVersiKasus: { ambilVersiKasus: (caseId, versionId) => repositoriVersiKasus.ambilVersiKasus(caseId, versionId) },
    penerbitEventDomain,
    waktu,
  });

  const layananInterogasi = buatLayananInterogasiKasus({
    repositoriSesi: repositoriSesiKasus,
    repositoriCaseBible,
    repositoriVersiKasus: { ambilVersiKasus: (caseId, versionId) => repositoriVersiKasus.ambilVersiKasus(caseId, versionId) },
    penerbitEventDomain,
    waktu,
    renderer: rendererNaratif,
  });

  const layananResolusi = buatLayananResolusiKasus({
    repositoriSesi: repositoriSesiKasus,
    repositoriCaseBible,
    repositoriVersiKasus: { ambilVersiKasus: (caseId, versionId) => repositoriVersiKasus.ambilVersiKasus(caseId, versionId) },
    repositoriKontribusi,
    repositoriSnapshot: repositoriSnapshotResolusi,
    penerbitEventDomain,
    waktu,
  });

  // Static pass-through: otoritas fitur ada di router (konfigurasi runtime
  // Firestore). Gate dinamis hanya untuk jalur router; injeksi manual
  // (test/penyedia kustom) memakai gate statis legacy agar override eksplisit
  // dihormati. Produksi (tanpa injeksi) fully dynamic tanpa redeploy.
  const pakaiRouterTeks = opsi.penyediaTeks === undefined;
  const pakaiGambarEnv = opsi.penyediaGambar === undefined;
  const gerbangDinamis = {
    ...(pakaiRouterTeks ? { gerbangKasus: () => routerAi.pastikanAktif("caseGeneration") } : {}),
    ...(pakaiGambarEnv ? { gerbangGambar: () => routerAi.pastikanAktif("image") } : {}),
  };
  const layananProduksiKasus = new LayananProduksiKasus({
    konfigurasi: {
      caseGenerationEnabled: pakaiRouterTeks ? true : konfigurasiAi.caseGenerationEnabled,
      penyediaTeks,
      penyediaGambar,
      penyimpananGambar,
      providerName: konfigurasiAi.provider,
      opsiGenerasi: {
        maxRetries: 1,
        maxOutputTokens: 4000,
        provider: konfigurasiAi.provider,
        model: konfigurasiAi.textModel,
      },
      ...gerbangDinamis,
    },
    repositoriVersi: {
      simpanVersiKasus: (versi) => repositoriVersiKasus.simpanVersiKasus(versi),
    },
    repositoriAset: repositoriAsetVisual,
    repositoriBible: repositoriCaseBibleFirestore,
  });

  const konfigurasiLayanan: KonfigurasiKomandoTelegram = {
    repositoriVersiKasus: {
      ambilVersiKasus: (caseId, versionId) =>
        caseId && versionId ? repositoriVersiKasus.ambilVersiKasus(caseId, versionId) : Promise.resolve(null),
      ambilVersiKasusTerbitan: () => repositoriVersiKasus.ambilVersiKasusTerbitan(),
      simpanVersiKasus: (versi) => repositoriVersiKasus.simpanVersiKasus(versi),
    },
    repositoriSesiKasus,
    repositoriGrup,
    penerbitEventDomain,
    kontrakIdempoten: repositoriIdempoten,
    waktu,
    kirimPesanTelegram: (chatId, pesan, opsi) => pengirimTelegram.kirimPesanTelegram(chatId, pesan, opsi).then(() => undefined),
    validasiAksesTelegram: (userId, chatId) => validatorAksesTelegram.validasi(userId, chatId),
    validasiGroupTelegram: (chatId) => validatorGrupTelegram.validasi(chatId),
    validasiAdminGrup: (userId, chatId) => validatorAdminGrupTelegram.validasi(userId, chatId),
    repositoriCaseBible,
    layananInvestigasi,
    layananInterogasi,
    layananResolusi,
    rendererNaratif,
    logger,
    layananProduksiKasus: { generateCase: (seed, opsi) => layananProduksiKasus.generateCase(seed, opsi) },
    layananTugasAset: {
      buatTugasAset: (caseId, caseVersionId, plan) => layananTugasAset.buatTugasAset(caseId, caseVersionId, plan),
      kirimTugasAset: (taskId) => layananTugasAset.kirimTugasAset(taskId),
      kirimUlangTugasAset: (taskId) => layananTugasAset.kirimUlangTugasAset(taskId),
      verifikasiTugasAset: (taskId) => layananTugasAset.verifikasiTugasAset(taskId),
      tolakTugasAset: (taskId, reason) => layananTugasAset.tolakTugasAset(taskId, reason),
    },
    repositoriAsetVisualProduksi: { ambilManifest: (caseId) => repositoriAsetVisual.ambilManifest(caseId) },
    pengirimInteraktif: pengirimTelegram,
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
    repositoriKonfigurasiAi,
    routerAi,
    penyediaTeks,
    penyediaGambar,
    penyimpananGambar,
    repositoriAsetVisual,
    layananProduksiKasus,
    repositoriTugasAset,
    layananTugasAset,
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