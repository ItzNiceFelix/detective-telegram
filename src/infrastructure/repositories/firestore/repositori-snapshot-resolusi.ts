import type { Firestore } from "firebase-admin/firestore";
import type { SnapshotPenyelesaian } from "../../../domain/kontrak-resolusi.js";
import { mapErrorFirestore } from "../../firebase/error-mapper.js";

export class RepositoriSnapshotResolusiFirestore {
  constructor(private readonly firestore: Firestore) {}

  async simpan(snapshot: SnapshotPenyelesaian): Promise<void> {
    try {
      await this.firestore.collection("case_sessions").doc(snapshot.sessionId).collection("resolution").doc("snapshot").set(snapshot as any);
    } catch (error) {
      throw mapErrorFirestore(error);
    }
  }
}