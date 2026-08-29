import type { WaktuIso } from "./primitif.js";

export interface PenyediaWaktu {
  sekarang(): Date;
  sekarangIso(): WaktuIso;
}

export class SistemWaktu implements PenyediaWaktu {
  sekarang(): Date {
    return new Date();
  }

  sekarangIso(): WaktuIso {
    return this.sekarang().toISOString() as WaktuIso;
  }
}

export class WaktuFiktif implements PenyediaWaktu {
  constructor(private readonly nilai: Date = new Date("2025-01-01T00:00:00.000Z")) {}

  sekarang(): Date {
    return new Date(this.nilai);
  }

  sekarangIso(): WaktuIso {
    return this.sekarang().toISOString() as WaktuIso;
  }
}
