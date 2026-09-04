import type { PintuAi } from "../../ai/contracts.js";
import { buatKesalahanProviderAi } from "../../ai/errors.js";
import type {
  KontrakPenyediaGambar,
  KontrakPenyimpananGambar,
  KontrakRepositoriAsetVisual,
  ManifestAsetVisual,
  VisualPlan,
} from "../../ai/visual-pipeline.js";
import {
  buatManifestAsetVisual,
  hasilkanAsetGambar,
  simpanReferensiAset,
} from "../../ai/visual-pipeline.js";
import {
  buatKandidatKasus,
  publikasikanKandidatKasus,
  type BenihKasus,
  type KandidatKasus,
  type OpsiGenerasiKasus,
} from "../../kasus/generasi-kasus.js";
import { StatusVersiKasus, type VersiKasus } from "../../kasus/versi-kasus.js";
import type { CaseBible } from "../../kasus/case-bible.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";

export interface RepositoriVersiProduksi {
  simpanVersiKasus(versi: VersiKasus): Promise<VersiKasus>;
  ambilVersiKasusTerbitan?: () => Promise<VersiKasus | null>;
}

export interface RepositoriBibleProduksi {
  simpanCaseBible(caseBible: CaseBible): Promise<void>;
}

export interface KonfigurasiLayananProduksi {
  caseGenerationEnabled: boolean;
  penyediaTeks: PintuAi | undefined;
  penyediaGambar: KontrakPenyediaGambar | undefined;
  penyimpananGambar?: KontrakPenyimpananGambar | undefined;
  providerName: string;
  opsiGenerasi?: { maxRetries?: number; maxOutputTokens?: number; provider?: string; model?: string };
  /** Gerbang dinamis opsional (router runtime config); dicek sebelum gate statis. */
  gerbangKasus?: () => Promise<void>;
  gerbangGambar?: () => Promise<void>;
}

export interface KonfigurasiServiceProduksi {
  konfigurasi: KonfigurasiLayananProduksi;
  repositoriVersi: RepositoriVersiProduksi;
  repositoriAset: KontrakRepositoriAsetVisual | undefined;
  /** Penyimpanan Case Bible AI (wajib di produksi agar case playable). */
  repositoriBible?: RepositoriBibleProduksi | undefined;
}

/**
 * Layanan produksi kasus â€” ADMIN/OFFLINE ONLY (bukan runtime gameplay).
 * Application â†’ AI Gateway â†’ provider adapter; CaseVersion/Game Engine tidak
 * pernah memanggil provider. Semua mutasi publish bersifat immutable & tervalidasi.
 *
 * Case generator: seed â†’ buatKandidatKasus (validation+solver+uniqueness+safety
 * +publish gate) â†’ publikasikanKandidatKasus (immutable PUBLISHED) â†’ simpan.
 * Gagal = kandidat DITOLAK, TIDAK ada partial publish.
 *
 * Image generator: VisualPlan â†’ prompt builder â†’ provider â†’ asset validation
 * â†’ durable repo â†’ manifest. Dedup oleh `hasilkanAsetGambar` (kunci stabil).
 */
export class LayananProduksiKasus {
  constructor(private readonly cfg: KonfigurasiServiceProduksi) {}

  async generateCase(seed: BenihKasus, opsi: OpsiGenerasiKasus = {}): Promise<KandidatKasus> {
    if (this.cfg.konfigurasi.gerbangKasus) {
      await this.cfg.konfigurasi.gerbangKasus();
    }
    if (!this.cfg.konfigurasi.caseGenerationEnabled) {
      throw buatKesalahanProviderAi("DISABLED", "AI Case Generation dinonaktifkan.");
    }
    const penyedia = this.cfg.konfigurasi.penyediaTeks;
    if (!penyedia) {
      throw buatKesalahanProviderAi("PROVIDER_UNAVAILABLE", "Text/AI provider tidak tersedia untuk case generation.");
    }

    const opsiKasus: OpsiGenerasiKasus = {
      maxRetries: this.cfg.konfigurasi.opsiGenerasi?.maxRetries ?? 1,
      maxOutputTokens: this.cfg.konfigurasi.opsiGenerasi?.maxOutputTokens ?? 4000,
      provider: this.cfg.konfigurasi.opsiGenerasi?.provider ?? this.cfg.konfigurasi.providerName,
    };
    if (this.cfg.konfigurasi.opsiGenerasi?.model) opsiKasus.model = this.cfg.konfigurasi.opsiGenerasi.model;
    if (opsi.model) opsiKasus.model = opsi.model;
    if (opsi.maxRetries !== undefined) opsiKasus.maxRetries = opsi.maxRetries;

    // Sudah melewati validasiGerbangPublikasi(validasiSemua:true) di dalam.
    const kandidat = await buatKandidatKasus(seed, penyedia, opsiKasus);
    // Simpan Case Bible AI ke Firestore SEBELUM versi DRAFT: tanpa ini case
    // terbit tapi semua command gameplay gagal ("Case Bible tidak ditemukan").
    if (this.cfg.repositoriBible) {
      await this.cfg.repositoriBible.simpanCaseBible(kandidat.caseBible);
    }
    const versiTervalidasi = publikasikanKandidatKasus(kandidat); // validasi penuh (solver/uniqueness/safety)
    // PRODUCTION FLOW (Part C): kandidat disimpan DRAFT menunggu asset gambar
    // durable; publish HANYA lewat admin `publishCase` SETELAH aset lengkap.
    // Kandidat TIDAK pernah menjadi PUBLISHED bila mandatory image assets hilang.
    const draftPending: VersiKasus = Object.freeze({
      ...versiTervalidasi,
      status: StatusVersiKasus.DRAFT,
      publishedAt: undefined,
    });
    await this.cfg.repositoriVersi.simpanVersiKasus(draftPending);
    return kandidat;
  }

  async generateImages(caseId: string, plans: VisualPlan[]): Promise<ManifestAsetVisual> {
    if (this.cfg.konfigurasi.gerbangGambar) {
      await this.cfg.konfigurasi.gerbangGambar();
    }
    const penyedia = this.cfg.konfigurasi.penyediaGambar;
    const repo = this.cfg.repositoriAset;
    if (!penyedia || !repo) {
      throw buatKesalahanProviderAi("PROVIDER_UNAVAILABLE", "Image/AI provider atau asset repository tidak tersedia.");
    }
    if (!caseId || plans.length === 0) {
      throw new KesalahanValidasi("generateImages membutuhkan caseId dan setidaknya satu VisualPlan.");
    }

    for (const plan of plans) {
      // hasilkanAsetGambar: cek cache (dari sumber repositori) â†’ generate bila
      // belum ada â†’ validasi â†’ simpan. Identity stabil caseId:sceneId:planId.
      const aset = await hasilkanAsetGambar(caseId, plan, penyedia, repo, this.cfg.konfigurasi.providerName, this.cfg.konfigurasi.penyimpananGambar);
      await simpanReferensiAset(repo, caseId, aset);
    }

    const manifest = (await repo.ambilManifest(caseId)) ?? buatManifestAsetVisual(caseId, []);
    return manifest;
  }
}