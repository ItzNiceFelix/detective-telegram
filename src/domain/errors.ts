export class KesalahanDomain extends Error {
  constructor(pesan: string, public readonly kode: string = "DOMAIN_ERROR") {
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

export class KesalahanIdempoten extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "IDEMPOTENCY_ERROR");
    this.name = "KesalahanIdempoten";
  }
}

export class KesalahanKonfigurasi extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "CONFIGURATION_ERROR");
    this.name = "KesalahanKonfigurasi";
  }
}

export class KesalahanIntegrasi extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "INTEGRATION_ERROR");
    this.name = "KesalahanIntegrasi";
  }
}

export class KesalahanTransaksi extends KesalahanDomain {
  constructor(pesan: string) {
    super(pesan, "TRANSACTION_ERROR");
    this.name = "KesalahanTransaksi";
  }
}
