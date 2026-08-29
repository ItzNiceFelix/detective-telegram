import { StatusSesi } from "../enums.js";

export interface StatusEfektif {
  statusPersisted: StatusSesi;
  effectiveStatus: "ACTIVE" | "INACTIVE" | "COLD" | "PAUSED" | "CLEARED" | "ARCHIVED";
  lastActivityAt?: string | undefined;
}

export function hitungStatusEfektif(statusPersisted: StatusSesi, lastActivityAt?: string): StatusEfektif {
  if (statusPersisted === StatusSesi.PAUSED) {
    return { statusPersisted, effectiveStatus: "PAUSED", lastActivityAt };
  }

  if (statusPersisted === StatusSesi.CLEARED) {
    return { statusPersisted, effectiveStatus: "CLEARED", lastActivityAt };
  }

  if (statusPersisted === StatusSesi.ARCHIVED) {
    return { statusPersisted, effectiveStatus: "ARCHIVED", lastActivityAt };
  }

  if (!lastActivityAt) {
    return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
  }

  return { statusPersisted, effectiveStatus: "ACTIVE", lastActivityAt };
}
