import type { SesiKasus } from "../entities.js";
import { KesalahanValidasi } from "../../fondasi/eror.js";
import type { CaseBible, JenisRelasiKausal, PeristiwaLinimasa } from "../../kasus/case-bible.js";
import { cariPeristiwaLinimasa } from "../../kasus/case-bible.js";

/**
 * Mengambil peristiwa linimasa yang SUDAH diketahui pemain (knownTimelineEventIds),
 * bukan seluruh canonical timeline. Ini adalah batas eksplisit antara canonical
 * timeline (CaseVersion, tersembunyi) dan player-known timeline (CaseSession).
 */
export function ambilPeristiwaLinimasa(sesi: SesiKasus, caseBible: CaseBible): PeristiwaLinimasa[] {
  return sesi.knownTimelineEventIds
    .map((eventId) => cariPeristiwaLinimasa(caseBible, eventId))
    .filter((peristiwa): peristiwa is PeristiwaLinimasa => peristiwa !== null);
}

interface EdgeKausalUntukValidasi {
  dari: string;
  ke: string;
  jenis: JenisRelasiKausal;
}

/**
 * Validasi bahwa relasi kausal CAUSES/REQUIRES/ENABLES/FOLLOWS tidak membentuk
 * cycle ilegal. PREVENTS dan CONTRADICTS dikecualikan dari cycle check karena
 * keduanya bersifat oposisi, bukan dependency chain.
 *
 * Ini adalah validasi build-time/Case Bible authoring, dipanggil terhadap
 * data Case Bible statis — bukan terhadap runtime session state.
 */
export function validasiRelasiKausal(relasi: EdgeKausalUntukValidasi[]): void {
  const jenisDependency: JenisRelasiKausal[] = ["CAUSES", "REQUIRES", "ENABLES", "FOLLOWS"];
  const edgesDependency = relasi.filter((r) => jenisDependency.includes(r.jenis));

  const grafAdjacency = new Map<string, string[]>();
  for (const edge of edgesDependency) {
    const daftar = grafAdjacency.get(edge.dari) ?? [];
    daftar.push(edge.ke);
    grafAdjacency.set(edge.dari, daftar);
  }

  const statusKunjungan = new Map<string, "MENGUNJUNGI" | "SELESAI">();

  function dfs(node: string, jejak: string[]): void {
    const status = statusKunjungan.get(node);
    if (status === "SELESAI") {
      return;
    }
    if (status === "MENGUNJUNGI") {
      throw new KesalahanValidasi(`Cycle ilegal terdeteksi pada relasi kausal: ${[...jejak, node].join(" -> ")}.`);
    }

    statusKunjungan.set(node, "MENGUNJUNGI");
    const tetangga = grafAdjacency.get(node) ?? [];
    for (const target of tetangga) {
      dfs(target, [...jejak, node]);
    }
    statusKunjungan.set(node, "SELESAI");
  }

  for (const node of grafAdjacency.keys()) {
    if (!statusKunjungan.has(node)) {
      dfs(node, []);
    }
  }
}