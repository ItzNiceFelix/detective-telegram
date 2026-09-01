import test from "node:test";
import assert from "node:assert/strict";

import { RepositoriIdempotenFirestore } from "../../src/infrastructure/repositories/firestore/repositori-idempoten.js";

function buatFirestoreStub() {
  const store = new Map<string, Record<string, unknown>>();

  return {
    collection: (_nama: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = store.get(id);
          return {
            exists: data !== undefined,
            data: () => data,
          };
        },
        set: async (data: Record<string, unknown>) => {
          store.set(id, data);
        },
      }),
    }),
    _store: store,
  } as any;
}

test("kunci idempotensi tidak terikat sessionId — bisa dipakai sebelum sesi ada", async () => {
  const firestore = buatFirestoreStub();
  const repositori = new RepositoriIdempotenFirestore(firestore);

  const kunciSebelum = await repositori.ambilKunci("telegram:update:999", "" as any);
  assert.equal(kunciSebelum, null);

  await repositori.simpanKunci({ actionId: "telegram:update:999", sessionId: "" as any, repeated: false });

  const kunciSetelah = await repositori.ambilKunci("telegram:update:999", "" as any);
  assert.notEqual(kunciSetelah, null);
  assert.equal(kunciSetelah?.repeated, true);
});

test("dokumen idempotensi tidak menyimpan payload besar — hanya field bounded", async () => {
  const firestore = buatFirestoreStub();
  const repositori = new RepositoriIdempotenFirestore(firestore);

  await repositori.simpanKunci({ actionId: "telegram:update:1", sessionId: "session-1" as any, repeated: false });

  const disimpan = firestore._store.get("telegram:update:1");
  const keys = Object.keys(disimpan);

  assert.deepEqual(keys.sort(), ["actionId", "createdAt", "repeated", "sessionId"].sort());
});

test("kunci berbeda tidak saling bertabrakan", async () => {
  const firestore = buatFirestoreStub();
  const repositori = new RepositoriIdempotenFirestore(firestore);

  await repositori.simpanKunci({ actionId: "telegram:update:1", sessionId: "session-1" as any, repeated: false });
  await repositori.simpanKunci({ actionId: "telegram:update:2", sessionId: "session-2" as any, repeated: false });

  const kunci1 = await repositori.ambilKunci("telegram:update:1", "session-1" as any);
  const kunci2 = await repositori.ambilKunci("telegram:update:2", "session-2" as any);

  assert.equal(kunci1?.sessionId, "session-1");
  assert.equal(kunci2?.sessionId, "session-2");
});

test("ambilKunci mengembalikan null untuk kunci yang belum pernah disimpan", async () => {
  const firestore = buatFirestoreStub();
  const repositori = new RepositoriIdempotenFirestore(firestore);

  const hasil = await repositori.ambilKunci("telegram:update:never", "session-1" as any);
  assert.equal(hasil, null);
});