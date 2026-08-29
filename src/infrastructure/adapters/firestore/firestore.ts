export interface QueryFirestore {
  collectionName: string;
  where?: Array<[string, string, unknown]>;
}

export interface FirestoreAdapter {
  readOne(collectionName: string, id: string): Promise<Record<string, unknown> | null>;
  readMany(query: QueryFirestore): Promise<Array<Record<string, unknown>>>;
  write(collectionName: string, id: string, data: Record<string, unknown>): Promise<void>;
  transaction<T>(runner: () => Promise<T>): Promise<T>;
}

export class FirestoreRepositoryAdapter implements FirestoreAdapter {
  async readOne(_collectionName: string, _id: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  async readMany(_query: QueryFirestore): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async write(_collectionName: string, _id: string, _data: Record<string, unknown>): Promise<void> {
    return;
  }

  async transaction<T>(runner: () => Promise<T>): Promise<T> {
    return runner();
  }
}
