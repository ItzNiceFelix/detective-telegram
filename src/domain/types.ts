export type IdGrup = string;
export type IdPemain = string;
export type IdSesiKasus = string;
export type IdKasus = string;
export type IdVersiKasus = string;
export type IdEvent = string;
export type IdObyek = string;

export type WaktuIso = string;

export interface MetadataKasus {
  title: string;
  premise: string;
  genre: string;
  tags: string[];
  starRating?: 1 | 2 | 3 | 4 | 5;
}

export interface KunciKontribusi {
  id: string;
  sessionId: IdSesiKasus;
  actionId: string;
}

export interface TitikWaktu {
  createdAt: WaktuIso;
  updatedAt: WaktuIso;
}
