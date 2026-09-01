import type { SesiKasus } from "../entities.js";
import type { WaktuIso } from "../../fondasi/primitif.js";
import { StatusSesi } from "../enums.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";
import type { CaseBible } from "../../kasus/case-bible.js";
import { cariBukti, cariDefinisiKontradiksiUntukKonfrontasi, cariTersangka } from "../../kasus/case-bible.js";

export interface HasilKonfrontasi {
  sesi: SesiKasus;
  kontradiksiBaruDitemukan: boolean;
  contradictionId?: string;
  nodeBaruDiunlock: boolean;
  timelineBaruDiketahui: boolean;
  sudahDikonfrontasiSebelumnya: boolean;
}

/**
 * Mengonfrontasi tersangka dengan evidence. Fungsi murni.
 *
 * Kontradiksi TIDAK dideteksi secara algoritmik di sini — hanya dicocokkan
 * terhadap DefinisiKontradiksi yang sudah ada di Case Bible (pre-authored).
 * Jika tidak ada definisi yang cocok, confrontation tetap "berhasil sebagai
 * aksi" (tidak melempar error) tetapi tidak menghasilkan kontradiksi — ini
 * mencegah softlock: pemain boleh mencoba confrontation yang salah tanpa
 * merusak proof path.
 *
 * Idempotent terhadap kontradiksi yang sama: mengulang confrontation yang
 * sudah menghasilkan kontradiksi tertentu tidak membuat instance kedua.
 */
export function konfrontasikanBukti(
  sesi: SesiKasus,
  caseBible: CaseBible,
  suspectId: string,
  evidenceId: string,
  waktuSekarang: WaktuIso,
): HasilKonfrontasi {
  validasiSesiTerbuka(sesi);

  const tersangka = cariTersangka(caseBible, suspectId);
  if (!tersangka) {
    throw new KesalahanValidasi(`Tersangka tidak ditemukan: ${suspectId}.`);
  }

  const bukti = cariBukti(caseBible, evidenceId);
  if (!bukti) {
    throw new KesalahanValidasi(`Evidence tidak ditemukan: ${evidenceId}.`);
  }

  if (!sesi.discoveredEvidenceIds.includes(evidenceId)) {
    throw new KesalahanValidasi("Evidence harus discovered sebelum dapat digunakan untuk confrontation.");
  }

  const definisi = cariDefinisiKontradiksiUntukKonfrontasi(caseBible, evidenceId, sesi.unlockedStatementIds);

  if (!definisi) {
    // Confrontation valid sebagai aksi, tetapi tidak menghasilkan kontradiksi
    // pada state saat ini (mis. statement terkait belum unlocked, atau
    // evidence ini memang tidak berelasi dengan tersangka ini).
    return {
      sesi,
      kontradiksiBaruDitemukan: false,
      nodeBaruDiunlock: false,
      timelineBaruDiketahui: false,
      sudahDikonfrontasiSebelumnya: false,
    };
  }

  if (definisi.relatedSuspectId !== suspectId) {
    return {
      sesi,
      kontradiksiBaruDitemukan: false,
      nodeBaruDiunlock: false,
      timelineBaruDiketahui: false,
      sudahDikonfrontasiSebelumnya: false,
    };
  }

  const sudahDikonfrontasiSebelumnya = sesi.discoveredContradictionIds.includes(definisi.contradictionId);

  if (sudahDikonfrontasiSebelumnya) {
    return {
      sesi,
      kontradiksiBaruDitemukan: false,
      contradictionId: definisi.contradictionId,
      nodeBaruDiunlock: false,
      timelineBaruDiketahui: false,
      sudahDikonfrontasiSebelumnya: true,
    };
  }

  const discoveredContradictionIdsBaru = [...sesi.discoveredContradictionIds, definisi.contradictionId];

  const nodeBaruDiunlock = Boolean(definisi.unlocksNodeId) && !sesi.unlockedDialogueIds.includes(definisi.unlocksNodeId!);
  const unlockedDialogueIdsBaru = nodeBaruDiunlock
    ? [...sesi.unlockedDialogueIds, definisi.unlocksNodeId!]
    : sesi.unlockedDialogueIds;

  const timelineBaruDiketahui =
    Boolean(definisi.revealsTimelineEventId) && !sesi.knownTimelineEventIds.includes(definisi.revealsTimelineEventId!);
  const knownTimelineEventIdsBaru = timelineBaruDiketahui
    ? [...sesi.knownTimelineEventIds, definisi.revealsTimelineEventId!]
    : sesi.knownTimelineEventIds;

  return {
    sesi: {
      ...sesi,
      discoveredContradictionIds: discoveredContradictionIdsBaru,
      unlockedDialogueIds: unlockedDialogueIdsBaru,
      knownTimelineEventIds: knownTimelineEventIdsBaru,
      lastActivityAt: waktuSekarang,
      updatedAt: waktuSekarang,
    },
    kontradiksiBaruDitemukan: true,
    contradictionId: definisi.contradictionId,
    nodeBaruDiunlock,
    timelineBaruDiketahui,
    sudahDikonfrontasiSebelumnya: false,
  };
}

function validasiSesiTerbuka(sesi: SesiKasus): void {
  if (sesi.status !== StatusSesi.OPEN) {
    throw new KesalahanValidasi("Confrontation hanya valid ketika sesi berstatus OPEN.");
  }
}