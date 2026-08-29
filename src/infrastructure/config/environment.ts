export interface KonfigurasiAplikasi {
  nodeEnv: "development" | "test" | "production";
  vercelFunctionBudget: number;
  maxActivePlayers: number;
  defaultGroupSessionLimit: number;
  aiEnabled: boolean;
  telegramWebhookSecret?: string;
}

export function buatKonfigurasiAplikasi(overrides: Partial<KonfigurasiAplikasi> = {}): KonfigurasiAplikasi {
  return {
    nodeEnv: "development",
    vercelFunctionBudget: 12,
    maxActivePlayers: 6,
    defaultGroupSessionLimit: 1,
    aiEnabled: false,
    ...overrides,
  };
}
