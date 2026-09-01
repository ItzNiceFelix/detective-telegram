import { KesalahanValidasi } from "../fondasi/eror.js";
import type { PintuAi, PermintaanAi, ResponAi } from "./contracts.js";

export interface KonteksAsistenDetektif {
  faktaYangBolehDiketahui: string[];
  evidenceDiketahui: string[];
  proofProgress?: string[];
  pertanyaanPemain: string;
}

export interface HasilAsistenDetektif {
  jawaban: string;
  aman: boolean;
}

export function bersihkanPertanyaanAsisten(value: string): string {
  const teks = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/(ignore|override|system prompt|developer prompt|prompt injection)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return teks.slice(0, 200);
}

export function buatResponsAsistenDetektif(
  konteks: KonteksAsistenDetektif,
  provider?: PintuAi,
): HasilAsistenDetektif {
  const pertanyaan = bersihkanPertanyaanAsisten(konteks.pertanyaanPemain);
  if (!pertanyaan) {
    throw new KesalahanValidasi("Pertanyaan pemain tidak boleh kosong.");
  }

  const fakta = konteks.faktaYangBolehDiketahui.filter((item) => item.trim().length > 0);
  const ringkasan = [...fakta, ...konteks.evidenceDiketahui].join("; ");

  if (!provider) {
    return {
      jawaban: `Saya hanya dapat menjelaskan fakta yang sudah diketahui: ${ringkasan || "belum ada fakta yang terbuka"}. Pertanyaan Anda: ${pertanyaan}.`,
      aman: true,
    };
  }

  const request: PermintaanAi = {
    promptType: "hint",
    context: {
      question: pertanyaan,
      facts: fakta,
      evidenceKnown: konteks.evidenceDiketahui,
      proofProgress: konteks.proofProgress ?? [],
      mode: "read_only",
    },
    maxTokens: 180,
  };

  return provider.generateText(request)
    .then((hasil: ResponAi) => {
      const output = String(hasil.output ?? "").trim();
      if (output.length === 0 || output.length > 400) {
        throw new KesalahanValidasi("Asisten detektif menghasilkan output di luar kontrak.");
      }

      if (/(final solution|culprit|murderer|secret truth|unlock all|you know)/i.test(output)) {
        throw new KesalahanValidasi("Asisten detektif tidak boleh merangkum solusi yang tersembunyi.");
      }

      return { jawaban: output, aman: true };
    })
    .catch(() => ({
      jawaban: `Saya hanya dapat membahas fakta yang sudah diketahui: ${ringkasan || "belum ada fakta yang terbuka"}. Pertanyaan Anda: ${pertanyaan}.`,
      aman: true,
    }));
}
