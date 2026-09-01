export type TingkatLog = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: TingkatLog;
  message: string;
  context?: Record<string, unknown>;
}

export class LoggerStruktur {
  constructor(private readonly level: TingkatLog = "info") {}

  private bolehCatat(level: TingkatLog): boolean {
    const urutan: Record<TingkatLog, number> = { debug: 10, info: 20, warn: 30, error: 40 };
    return urutan[level] >= urutan[this.level];
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.catat("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.catat("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.catat("error", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.catat("debug", message, context);
  }

  private catat(level: TingkatLog, message: string, context?: Record<string, unknown>): void {
    if (!this.bolehCatat(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    };

    // Logger minimal untuk lokal / deployment. Ini mencegah API call tanpa kebutuhan domain.
    if (process.env.NODE_ENV !== "production") {
      console.log(JSON.stringify(entry));
    }
  }
}

export function buatLoggerStruktur(level: TingkatLog = "info"): LoggerStruktur {
  return new LoggerStruktur(level);
}
