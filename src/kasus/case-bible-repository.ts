import type { CaseBible } from "./case-bible.js";

export interface KontrakRepositoriCaseBible {
  ambilCaseBible(ref: string): Promise<CaseBible | null>;
}

/**
 * Implementasi statis berbasis fixture in-code. Case Bible content bersifat
 * immutable per CaseVersion, sehingga aman dibaca tanpa transaction (sama
 * seperti RepositoriVersiKasusFirestore.ambilVersiKasusTerbitan di Milestone 3).
 *
 * TIDAK menyimpan content ke Firestore — CaseSession hanya boleh berisi runtime
 * state (docs/17-persistence-contract.md §17.4).
 */
export class RepositoriCaseBibleStatis implements KontrakRepositoriCaseBible {
  private readonly daftar: Map<string, CaseBible>;

  constructor(caseBibleList: CaseBible[]) {
    this.daftar = new Map(caseBibleList.map((cb) => [cb.caseBibleRef, cb]));
  }

  async ambilCaseBible(ref: string): Promise<CaseBible | null> {
    return this.daftar.get(ref) ?? null;
  }
}