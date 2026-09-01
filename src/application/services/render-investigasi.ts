import type { HasilSelidikiAdegan, HasilPeriksaObjek } from "../../domain/services/investigasi.js";

export interface PesanTelegram {
  text: string;
  keyboard?: Array<Array<{ text: string; callback_data: string }>>;
}

export function renderDaftarObjek(sessionShortId: string, hasil: HasilSelidikiAdegan): PesanTelegram {
  if (hasil.objekTampak.length === 0) {
    return { text: "🔎 Investigation\n\nTidak ada objek yang terlihat saat ini." };
  }

  const daftar = hasil.objekTampak.map((objek) => `• ${emojiUntukObjek(objek.name)} ${objek.name}`).join("\n");

  const keyboard = hasil.objekTampak.map((objek) => [
    { text: `${emojiUntukObjek(objek.name)} ${objek.name}`, callback_data: `v1:inspect:${sessionShortId}:${objek.objectId}` },
  ]);

  return {
    text: `🔎 Investigation\n\n${daftar}`,
    keyboard,
  };
}

export function renderHasilPeriksaObjek(hasil: HasilPeriksaObjek, namaObjek: string): PesanTelegram {
  const emoji = emojiUntukObjek(namaObjek);

  if (hasil.sudahDiperiksaSebelumnya) {
    return {
      text: `${emoji} ${namaObjek}\n\n${hasil.observasi.text}\n\n(Sudah diperiksa sebelumnya.)`,
    };
  }

  if (!hasil.evidenceId) {
    return {
      text: `${emoji} ${namaObjek}\n\n${hasil.observasi.text}`,
    };
  }

  if (hasil.evidenceBaruDitemukan) {
    return {
      text: `${emoji} ${namaObjek}\n\n${hasil.observasi.text}\n\n✅ Evidence ditemukan: ${hasil.evidenceId}`,
    };
  }

  return {
    text: `${emoji} ${namaObjek}\n\n${hasil.observasi.text}\n\n(Evidence ${hasil.evidenceId} sudah ditemukan sebelumnya oleh tim.)`,
  };
}

export function renderDaftarBukti(discoveredEvidenceIds: string[]): PesanTelegram {
  if (discoveredEvidenceIds.length === 0) {
    return { text: "🧪 Evidence\n\nBelum ada evidence yang ditemukan." };
  }

  const daftar = discoveredEvidenceIds.map((id) => `• ${id}`).join("\n");
  return { text: `🧪 Evidence\n\n${daftar}` };
}

function emojiUntukObjek(name: string): string {
  const pemetaan: Record<string, string> = {
    "Broken Watch": "🕰️",
    "Wet Footprints": "👞",
    "Open Window": "🪟",
    "Wine Glass": "🍷",
    "Desk": "🗄️",
  };

  return pemetaan[name] ?? "🔎";
}