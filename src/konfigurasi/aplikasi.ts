import { KesalahanKonfigurasi } from "../fondasi/eror.js";

export interface KonfigurasiAplikasi {
  nodeEnv: "development" | "test" | "production";
  vercelFunctionBudget: number;
  targetFunctionCount: number;
  maxActivePlayers: number;
  defaultGroupSessionLimit: number;
  aiEnabled: boolean;
  telegramWebhookSecret?: string;
}

export const konfigurasiDefault: KonfigurasiAplikasi = {
  nodeEnv: "development",
  vercelFunctionBudget: 12,
  targetFunctionCount: 4,
  maxActivePlayers: 6,
  defaultGroupSessionLimit: 1,
  aiEnabled: false,
};

export function validasiKonfigurasiAplikasi(konfigurasi: Partial<KonfigurasiAplikasi>): KonfigurasiAplikasi {
  const hasil = { ...konfigurasiDefault, ...konfigurasi };

  if (hasil.vercelFunctionBudget < hasil.targetFunctionCount) {
    throw new KesalahanKonfigurasi("Budget Vercel function tidak boleh lebih kecil dari target production function.");
  }

  if (hasil.maxActivePlayers <= 0) {
    throw new KesalahanKonfigurasi("Jumlah player aktif harus lebih dari nol.");
  }

  if (hasil.defaultGroupSessionLimit <= 0) {
    throw new KesalahanKonfigurasi("Batas sesi grup harus lebih dari nol.");
  }

  return hasil;
}
