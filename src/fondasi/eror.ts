export type KodeKesalahan =
  | "DOMAIN_ERROR"
  | "APPLICATION_ERROR"
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "IDEMPOTENCY_ERROR"
  | "CONFIGURATION_ERROR"
  | "INTEGRATION_ERROR";

export class KesalahanDomain extends Error {
  constructor(pesan: string, public readonly kode: KodeKesalahan = "DOMAIN_ERROR") {
    super(pesan);
    this.name = "KesalahanDomain";
  }
}

export class KesalahanValidasi extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "VALIDATION_ERROR");
    this.name = "KesalahanValidasi";
  }
}

export class KesalahanAutorisasi extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "AUTHORIZATION_ERROR");
    this.name = "KesalahanAutorisasi";
  }
}

export class KesalahanAplikasi extends Error {
  constructor(pesan: string, public readonly kode: KodeKesalahan = "APPLICATION_ERROR") {
    super(pesan);
    this.name = "KesalahanAplikasi";
  }
}

export class KesalahanKonfigurasi extends KesalahanAplikasi {
  constructor(pesan: string) {
    super(pesan, "CONFIGURATION_ERROR");
    this.name = "KesalahanKonfigurasi";
  }
}

export class KesalahanIdempoten extends KesalahanAplikasi {
  constructor(pesan: string) {
    super(pesan, "IDEMPOTENCY_ERROR");
    this.name = "KesalahanIdempoten";
  }
}

export class KesalahanIntegrasi extends KesalahanAplikasi {
  constructor(pesan: string) {
    super(pesan, "INTEGRATION_ERROR");
    this.name = "KesalahanIntegrasi";
  }
}
