import type { HasilOperasi } from "../../../fondasi/hasil.js";
import type { IdGrup, IdKasus, IdPemain, IdVersiKasus } from "../../../fondasi/primitif.js";
import { MulaiSesiKasusLayanan } from "../../../application/services/mulai-sesi-kasus.js";

export interface PermintaanStartCaseTelegram {
  updateId: string;
  userId: IdPemain;
  groupId: IdGrup;
  caseId: IdKasus;
  caseVersionId: IdVersiKasus;
  actionId: string;
}

export interface ResponHandlerTelegram {
  chatId: string;
  text: string;
}

export class StartCaseTelegramHandler {
  constructor(private readonly layanan: MulaiSesiKasusLayanan) {}

  async prosesPermintaan(permintaan: PermintaanStartCaseTelegram): Promise<HasilOperasi<{ sessionId: string }, Error>> {
    const hasil = await this.layanan.mulaiSesiKasus({
      idUpdateTelegram: permintaan.updateId,
      caseId: permintaan.caseId,
      caseVersionId: permintaan.caseVersionId,
      groupId: permintaan.groupId,
      userId: permintaan.userId,
      sourceActionId: permintaan.actionId,
    });

    if (hasil.status === "gagal") {
      return {
        status: "gagal",
        error: hasil.error,
      };
    }

    return {
      status: "berhasil",
      data: {
        sessionId: String(hasil.data.sessionId),
      },
    };
  }

  renderResponse(hasil: HasilOperasi<{ sessionId: string }, Error>): ResponHandlerTelegram {
    if (hasil.status === "gagal") {
      return {
        chatId: "",
        text: "Gagal memulai sesi kasus. Silakan coba lagi nanti.",
      };
    }

    return {
      chatId: "",
      text: `Sesi kasus sudah dimulai. ID sesi: ${hasil.data.sessionId}`,
    };
  }
}
