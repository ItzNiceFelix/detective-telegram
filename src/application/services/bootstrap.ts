import type { LayananKasus, LayananAkses, LayananEvent, LayananGrup, LayananPengguna, LayananSesiKasus } from "../contracts.js";

export interface KonstruksiLayananAplikasi {
  layananKasus: LayananKasus;
  layananAkses: LayananAkses;
  layananEvent: LayananEvent;
  layananGrup: LayananGrup;
  layananPengguna: LayananPengguna;
  layananSesiKasus: LayananSesiKasus;
}

export function buatBootstrapLayananAplikasi(
  layanan: KonstruksiLayananAplikasi,
): KonstruksiLayananAplikasi {
  return layanan;
}
