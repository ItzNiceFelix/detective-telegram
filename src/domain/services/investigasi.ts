import type { SesiKasus } from "../entities.js";
import type { IdPemain, WaktuIso } from "../../fondasi/primitif.js";
import { StatusSesi } from "../enums.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";
import type { CaseBible, ObjekDapatDiperiksa, Observasi } from "../../kasus/case-bible.js";
import { ambilObjekPadaAdegan, cariAdegan, cariBukti, cariObjek, cariObservasi } from "../../kasus/case-bible.js";

export interface HasilSelidikiAdegan {
  sceneId: string;
  objekTampak: ObjekDapatDiperiksa[];
}

/**
 * Menyelidiki adegan: mengembalikan daftar object yang visible saat ini.
 * TIDAK memutasi SesiKasus, TIDAK menghasilkan evidence secara otomatis.
 * Repeated call terhadap adegan yang sama selalu menghasilkan hasil yang sama
 * (tidak ada reward tambahan) karena fungsi ini murni tidak menulis state.
 */
export function selidikiAdegan(sesi: SesiKasus, caseBible: CaseBible, sceneId: string): HasilSelidikiAdegan {
  validasiSesiTerbuka(sesi);

  const adegan = cariAdegan(caseBible, sceneId);
  if (!adegan) {
    throw new KesalahanValidasi(`Adegan tidak ditemukan: ${sceneId}.`);
  }

  const objekTampak = ambilObjekYangDapatDiperiksa(sesi, caseBible, sceneId);

  return { sceneId, objekTampak };
}

/**
 * Mengembalikan object pada adegan tertentu yang visible menurut modeDiscovery
 * dan state discovery saat ini. HIDDEN tidak pernah dikembalikan (belum ada
 * unlock mechanism di milestone ini). CONDITIONAL dikembalikan hanya jika
 * prasyarat terpenuhi terhadap discoveredEvidenceIds saat ini.
 */
export function ambilObjekYangDapatDiperiksa(sesi: SesiKasus, caseBible: CaseBible, sceneId: string): ObjekDapatDiperiksa[] {
  const semuaObjek = ambilObjekPadaAdegan(caseBible, sceneId);

  return semuaObjek.filter((objek) => apakahObjekVisible(sesi, objek));
}

function apakahObjekVisible(sesi: SesiKasus, objek: ObjekDapatDiperiksa): boolean {
  if (objek.modeDiscovery === "HIDDEN") {
    return false;
  }

  if (objek.modeDiscovery === "AUTO") {
    return true;
  }

  // CONDITIONAL — semua prasyarat harus terpenuhi.
  const prasyarat = objek.prasyarat ?? [];
  return prasyarat.every((syarat) => sesi.discoveredEvidenceIds.includes(syarat.evidenceDiscovered));
}

export interface HasilPeriksaObjek {
  sesi: SesiKasus;
  observasi: Observasi;
  evidenceBaruDitemukan: boolean;
  evidenceId?: string;
  sudahDiperiksaSebelumnya: boolean;
}

/**
 * Memeriksa object. Fungsi murni — pemanggil bertanggung jawab melakukan
 * transaksi Firestore di sekitar pemanggilan ini.
 *
 * Idempotent terhadap object yang sama: jika object sudah ada di
 * examinedObjectIds, mengembalikan SesiKasus yang TIDAK berubah (referensi
 * sama) dengan sudahDiperiksaSebelumnya=true — pemanggil tidak boleh menulis
 * ulang state maupun mengirim event evidence discovery kedua kalinya.
 *
 * Ini adalah pertahanan utama untuk concurrency: dua pemanggilan periksaObjek
 * terhadap snapshot SesiKasus yang sama (dari transaction retry Firestore
 * ataupun dari dua update Telegram berbeda) akan menghasilkan efek yang sama —
 * hanya panggilan pertama yang benar-benar mengubah state.
 */
export function periksaObjek(
  sesi: SesiKasus,
  caseBible: CaseBible,
  objectId: string,
  _pemeriksa: IdPemain,
  waktuSekarang: WaktuIso,
): HasilPeriksaObjek {
  validasiSesiTerbuka(sesi);

  const objek = cariObjek(caseBible, objectId);
  if (!objek) {
    throw new KesalahanValidasi(`Object tidak ditemukan: ${objectId}.`);
  }

  if (!apakahObjekVisible(sesi, objek)) {
    throw new KesalahanValidasi(`Object belum dapat diperiksa: ${objectId}.`);
  }

  const observasi = cariObservasi(caseBible, objectId);
  if (!observasi) {
    throw new KesalahanValidasi(`Observation tidak tersedia untuk object: ${objectId}.`);
  }

  const sudahDiperiksaSebelumnya = sesi.examinedObjectIds.includes(objectId);

  if (sudahDiperiksaSebelumnya) {
    // No-op: object sudah diperiksa, tidak ada reward/discovery kedua.
    return {
      sesi,
      observasi,
      evidenceBaruDitemukan: false,
      evidenceId: objek.evidenceId,
      sudahDiperiksaSebelumnya: true,
    };
  }

  const examinedObjectIdsBaru = [...sesi.examinedObjectIds, objectId];

  if (!objek.evidenceId) {
    // Object valid tetapi tidak menghasilkan evidence.
    return {
      sesi: {
        ...sesi,
        examinedObjectIds: examinedObjectIdsBaru,
        lastActivityAt: waktuSekarang,
        updatedAt: waktuSekarang,
      },
      observasi,
      evidenceBaruDitemukan: false,
      sudahDiperiksaSebelumnya: false,
    };
  }

  const bukti = cariBukti(caseBible, objek.evidenceId);
  if (!bukti) {
    throw new KesalahanValidasi(`Evidence tidak ditemukan pada Case Bible: ${objek.evidenceId}.`);
  }

  const evidenceSudahDitemukan = sesi.discoveredEvidenceIds.includes(bukti.evidenceId);

  const discoveredEvidenceIdsBaru = evidenceSudahDitemukan
    ? sesi.discoveredEvidenceIds
    : [...sesi.discoveredEvidenceIds, bukti.evidenceId];

  return {
    sesi: {
      ...sesi,
      examinedObjectIds: examinedObjectIdsBaru,
      discoveredEvidenceIds: discoveredEvidenceIdsBaru,
      lastActivityAt: waktuSekarang,
      updatedAt: waktuSekarang,
    },
    observasi,
    evidenceBaruDitemukan: !evidenceSudahDitemukan,
    evidenceId: bukti.evidenceId,
    sudahDiperiksaSebelumnya: false,
  };
}

function validasiSesiTerbuka(sesi: SesiKasus): void {
  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanValidasi("Investigasi hanya valid ketika sesi berstatus OPEN.");
  }
}