import type { Transaction } from "firebase-admin/firestore";

/**
 * Fake Firestore untuk integration test — meniru semantik transaction
 * Firestore yang relevan untuk wiring patch:
 * - get membaca state committed;
 * - set/create dibuffer dan di-commit berurutan;
 * - create gagal (already-exists) bila dokumen sudah ada saat commit;
 * - runTransaction diserialisasi (transaksi concurrent dieksekusi berurutan,
 *   meniru behavior conflict-retry Firestore untuk dokumen yang sama).
 */
type DataDokumen = Record<string, unknown>;

export interface RefDokumenPalsu {
  __nama: string;
  __id: string;
  get(): Promise<{ exists: boolean; id: string; data(): DataDokumen | undefined }>;
  set(data: DataDokumen): Promise<void>;
  create(data: DataDokumen): Promise<void>;
  collection(nama: string): { doc(id: string): RefDokumenPalsu };
}

function buatErrorSudahAda(nama: string, id: string): Error {
  const error = new Error(`Document already exists: ${nama}/${id}`) as Error & { code?: string };
  error.code = "already-exists";
  return error;
}

export class FirestorePalsu {
  private readonly store = new Map<string, Map<string, DataDokumen>>();
  private antreanTransaksi: Promise<unknown> = Promise.resolve();

  private koleksiStore(nama: string): Map<string, DataDokumen> {
    let k = this.store.get(nama);
    if (!k) {
      k = new Map<string, DataDokumen>();
      this.store.set(nama, k);
    }
    return k;
  }

  refDokumen(nama: string, id: string): RefDokumenPalsu {
    const self = this;
    return {
      __nama: nama,
      __id: id,
      async get() {
        return self.baca(nama, id);
      },
      async set(data: DataDokumen) {
        self.tulis(nama, id, data);
      },
      async create(data: DataDokumen) {
        if (self.koleksiStore(nama).has(id)) {
          throw buatErrorSudahAda(nama, id);
        }
        self.tulis(nama, id, data);
      },
      collection(subNama: string) {
        return self.collection(`${nama}/${id}/${subNama}`);
      },
    };
  }

  collection(nama: string) {
    const self = this;
    return {
      doc: (id: string) => self.refDokumen(nama, id),
      where: (field: string, op: string, nilai: unknown) => self.buatQuery(nama, field, op, nilai),
    };
  }

  private buatQuery(nama: string, field: string, op: string, nilai: unknown) {
    const self = this;
    return {
      limit: (_jumlah: number) => self.buatQuery(nama, field, op, nilai),
      async get() {
        const sumber = self.koleksiStore(nama);
        const docs = Array.from(sumber.entries())
          .filter(([, data]) => (op === "==" ? data[field] === nilai : true))
          .map(([id, data]) => ({ id, exists: true, data: () => data }));
        return { empty: docs.length === 0, docs };
      },
    };
  }

  private baca(nama: string, id: string) {
    const data = this.koleksiStore(nama).get(id);
    return { exists: data !== undefined, id, data: () => (data ? structuredClone(data) : undefined) };
  }

  private tulis(nama: string, id: string, data: DataDokumen) {
    this.koleksiStore(nama).set(id, structuredClone(data));
  }

  async runTransaction<T>(runner: (tx: Transaction) => Promise<T>): Promise<T> {
    const self = this;
    const jalankan = async (): Promise<T> => {
      const buffer: Array<{ ref: RefDokumenPalsu; data: DataDokumen; op: "set" | "create" }> = [];
      const tx = {
        async get(ref: RefDokumenPalsu) {
          return self.baca(ref.__nama, ref.__id);
        },
        set(ref: RefDokumenPalsu, data: DataDokumen) {
          buffer.push({ ref, data, op: "set" });
        },
        create(ref: RefDokumenPalsu, data: DataDokumen) {
          buffer.push({ ref, data, op: "create" });
        },
      } as unknown as Transaction;

      const hasil = await runner(tx);

      for (const operasi of buffer) {
        if (operasi.op === "create" && self.koleksiStore(operasi.ref.__nama).has(operasi.ref.__id)) {
          throw buatErrorSudahAda(operasi.ref.__nama, operasi.ref.__id);
        }
        self.tulis(operasi.ref.__nama, operasi.ref.__id, operasi.data);
      }

      return hasil;
    };

    const berikutnya = this.antreanTransaksi.then(jalankan, jalankan);
    this.antreanTransaksi = berikutnya.then(
      () => undefined,
      () => undefined,
    );
    return berikutnya;
  }

  // --- Helper assertion ---
  ambilDokumen(nama: string, id: string): DataDokumen | undefined {
    return this.koleksiStore(nama).get(id);
  }

  semuaDokumen(nama: string): DataDokumen[] {
    return Array.from(this.koleksiStore(nama).values());
  }

  jumlahDokumen(nama: string): number {
    return this.koleksiStore(nama).size;
  }
}