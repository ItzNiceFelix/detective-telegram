export type IdGrup = string & { readonly __brand: "IdGrup" };
export type IdPemain = string & { readonly __brand: "IdPemain" };
export type IdSesiKasus = string & { readonly __brand: "IdSesiKasus" };
export type IdKasus = string & { readonly __brand: "IdKasus" };
export type IdVersiKasus = string & { readonly __brand: "IdVersiKasus" };
export type IdEvent = string & { readonly __brand: "IdEvent" };
export type WaktuIso = string & { readonly __brand: "WaktuIso" };
export type NomorVersi = number & { readonly __brand: "NomorVersi" };

export function buatIdGrup(value: string): IdGrup {
  return value as IdGrup;
}

export function buatIdPemain(value: string): IdPemain {
  return value as IdPemain;
}

export function buatIdSesiKasus(value: string): IdSesiKasus {
  return value as IdSesiKasus;
}

export function buatIdKasus(value: string): IdKasus {
  return value as IdKasus;
}

export function buatIdVersiKasus(value: string): IdVersiKasus {
  return value as IdVersiKasus;
}

export function buatIdEvent(value: string): IdEvent {
  return value as IdEvent;
}

export function buatWaktuIso(value: string): WaktuIso {
  return value as WaktuIso;
}

export function buatNomorVersi(value: number): NomorVersi {
  return value as NomorVersi;
}
