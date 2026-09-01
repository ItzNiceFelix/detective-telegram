export type {
  IdGrup,
  IdPemain,
  IdSesiKasus,
  IdKasus,
  IdVersiKasus,
  IdEvent,
  WaktuIso,
  NomorVersi,
} from "../fondasi/primitif.js";

export type IdObyek = string;

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
