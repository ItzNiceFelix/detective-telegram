export interface OpsiBatasKejadian {
  maxPermintaan: number;
  jendelaMs: number;
}

interface BalokBatas {
  hitungan: number;
  resetPada: number;
}

export class PenghitungBatasKejadian {
  private readonly balok = new Map<string, BalokBatas>();

  constructor(private readonly opsi: OpsiBatasKejadian = { maxPermintaan: 30, jendelaMs: 60_000 }) {}

  periksa(key: string): { diizinkan: boolean; sisa: number; resetPada: number } {
    const kunci = key || "global";
    const sekarang = Date.now();
    const balokSaatIni = this.balok.get(kunci);

    if (!balokSaatIni || balokSaatIni.resetPada <= sekarang) {
      const resetPada = sekarang + this.opsi.jendelaMs;
      this.balok.set(kunci, { hitungan: 1, resetPada });
      return {
        diizinkan: true,
        sisa: Math.max(0, this.opsi.maxPermintaan - 1),
        resetPada,
      };
    }

    const sisa = this.opsi.maxPermintaan - balokSaatIni.hitungan;
    if (balokSaatIni.hitungan >= this.opsi.maxPermintaan) {
      return {
        diizinkan: false,
        sisa: 0,
        resetPada: balokSaatIni.resetPada,
      };
    }

    balokSaatIni.hitungan += 1;
    return {
      diizinkan: true,
      sisa: Math.max(0, sisa - 1),
      resetPada: balokSaatIni.resetPada,
    };
  }

  bersihkan(key: string): void {
    this.balok.delete(key || "global");
  }
}

export function buatRateLimiter(opsi?: Partial<OpsiBatasKejadian>): PenghitungBatasKejadian {
  return new PenghitungBatasKejadian({
    maxPermintaan: opsi?.maxPermintaan ?? 30,
    jendelaMs: opsi?.jendelaMs ?? 60_000,
  });
}
