import { KesalahanValidasi } from "../fondasi/eror.js";
import type { IdKasus, IdVersiKasus, WaktuIso } from "../fondasi/primitif.js";

export enum StatusVersiKasus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  DISABLED = "DISABLED",
}

export interface MetadataVersiKasus {
  title: string;
  premise: string;
  genre: string;
  tags: string[];
  starRating?: 1 | 2 | 3 | 4 | 5 | undefined;
}

export interface VersiKasusData {
  caseId: IdKasus;
  versionId: IdVersiKasus;
  schemaVersion: number;
  metadata: MetadataVersiKasus;
  caseBibleRef: string;
  assetManifestRef: string;
  contentSummary: string;
  contentHash?: string;
  status?: StatusVersiKasus;
  publishedAt?: WaktuIso;
}

export interface VersiKasus {
  caseId: IdKasus;
  versionId: IdVersiKasus;
  schemaVersion: number;
  contentHash: string;
  status: StatusVersiKasus;
  metadata: MetadataVersiKasus;
  caseBibleRef: string;
  assetManifestRef: string;
  contentSummary: string;
  publishedAt?: WaktuIso | undefined;
}

function hashKonten(data: string): string {
  let hasil = 0;
  for (let indeks = 0; indeks < data.length; indeks += 1) {
    hasil = (hasil * 31 + data.charCodeAt(indeks)) >>> 0;
  }
  return `hash-${hasil.toString(16)}`;
}

export function validasiVersiKasus(versi: VersiKasus): void {
  if (!versi.caseId || !versi.versionId) {
    throw new KesalahanValidasi("Versi kasus membutuhkan caseId dan versionId.");
  }

  if (versi.schemaVersion <= 0) {
    throw new KesalahanValidasi("schemaVersion harus lebih besar dari nol.");
  }

  if (!versi.metadata?.title || !versi.metadata.premise || !versi.metadata.genre) {
    throw new KesalahanValidasi("Metadata versi kasus tidak lengkap.");
  }

  if (!versi.caseBibleRef || !versi.assetManifestRef) {
    throw new KesalahanValidasi("Case Bible reference dan asset manifest wajib ada.");
  }

  if (!versi.contentHash || versi.contentHash.trim() === "") {
    throw new KesalahanValidasi("contentHash wajib diisi.");
  }

  if (versi.status === StatusVersiKasus.PUBLISHED && !versi.publishedAt) {
    throw new KesalahanValidasi("Versi yang dipublish wajib memiliki publishedAt.");
  }
}

export function buatVersiKasus(data: VersiKasusData): VersiKasus {
  const fixedContent = JSON.stringify({
    caseId: data.caseId,
    versionId: data.versionId,
    schemaVersion: data.schemaVersion,
    metadata: data.metadata,
    caseBibleRef: data.caseBibleRef,
    assetManifestRef: data.assetManifestRef,
    contentSummary: data.contentSummary,
  });

  const versi: VersiKasus = {
    caseId: data.caseId,
    versionId: data.versionId,
    schemaVersion: data.schemaVersion,
    contentHash: data.contentHash ?? hashKonten(fixedContent),
    status: data.status ?? StatusVersiKasus.DRAFT,
    metadata: data.metadata,
    caseBibleRef: data.caseBibleRef,
    assetManifestRef: data.assetManifestRef,
    contentSummary: data.contentSummary,
    publishedAt: data.publishedAt,
  };

  validasiVersiKasus(versi);
  return versi;
}

export function publikasiVersiKasus(versi: VersiKasus, waktuPublikasi: WaktuIso): VersiKasus {
  if (versi.status === StatusVersiKasus.PUBLISHED) {
    throw new KesalahanValidasi("Versi kasus sudah dipublish dan bersifat immutable.");
  }

  if (versi.status === StatusVersiKasus.DISABLED) {
    throw new KesalahanValidasi("Versi kasus yang dinonaktifkan tidak dapat dipublish.");
  }

  validasiVersiKasus(versi);

  const versiPublik: VersiKasus = {
    ...versi,
    status: StatusVersiKasus.PUBLISHED,
    publishedAt: waktuPublikasi,
  };

  validasiVersiKasus(versiPublik);
  return versiPublik;
}

export function buatVersiKasusImmutable(data: VersiKasusData): VersiKasus {
  return Object.freeze(buatVersiKasus(data));
}

export const CASE_VERSION_INVARIANTS = [
  "CASE-01 — CaseVersion adalah immutable playable snapshot.",
  "CASE-02 — CaseSession selalu menunjuk ke satu CaseVersion spesifik.",
  "CASE-03 — Case Bible adalah canonical truth; AI runtime bukan authority.",
  "CASE-06 — Setiap case v1 mempunyai tepat satu canonical solution.",
  "CASE-10 — Perubahan truth substantif membuat CaseVersion baru, bukan mutasi version lama.",
] as const;
