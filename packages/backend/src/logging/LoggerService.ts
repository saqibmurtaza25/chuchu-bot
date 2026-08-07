export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, any>;
  error?: { name: string; message: string; stack?: string };
}

/**
 * LoggerService
 * Enterprise structured logging provider supporting formatted logs, context tags, and level filtering.
 */
export class LoggerService {
  private static instance: LoggerService;
  private minLogLevel: number;
  private enableJsonFormat: boolean;

  private constructor(minLevel: LogLevel = 'info', jsonFormat: boolean = false) {
    this.minLogLevel = LOG_SEVERITY[minLevel];
    this.enableJsonFormat = jsonFormat;
  }

  public static getInstance(minLevel: LogLevel = 'info', jsonFormat: boolean = false): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService(minLevel, jsonFormat);
    }
    return LoggerService.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.minLogLevel = LOG_SEVERITY[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_SEVERITY[level] >= this.minLogLevel;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.enableJsonFormat) {
      return JSON.stringify(entry);
    }
    const colorReset = '\x1b[0m';
    const colorLevel =
      entry.level === 'error'
        ? '\x1b[31m' // Red
        : entry.level === 'warn'
        ? '\x1b[33m' // Yellow
        : entry.level === 'info'
        ? '\x1b[36m' // Cyan
        : '\x1b[90m'; // Debug Gray

    const ctx = entry.context ? ` | Context: ${JSON.stringify(entry.context)}` : '';
    const err = entry.error ? ` | Error: ${entry.error.message}` : '';
    return `[${entry.timestamp}] ${colorLevel}${entry.level.toUpperCase()}${colorReset} [${entry.component}]: ${entry.message}${ctx}${err}`;
  }

  public log(level: LogLevel, component: string, message: string, context?: Record<string, any>, err?: Error): LogEntry | null {
    if (!this.shouldLog(level)) return null;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      context,
      error: err ? { name: err.name, message: err.message, stack: err.stack } : undefined
    };

    const formatted = this.formatEntry(entry);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    return entry;
  }

  public debug(component: string, message: string, context?: Record<string, any>): LogEntry | null {
    return this.log('debug', component, message, context);
  }

  public info(component: string, message: string, context?: Record<string, any>): LogEntry | null {
    return this.log('info', component, message, context);
  }

  public warn(component: string, message: string, context?: Record<string, any>): LogEntry | null {
    return this.log('warn', component, message, context);
  }

  public error(component: string, message: string, err?: Error, context?: Record<string, any>): LogEntry | null {
    return this.log('error', component, message, context, err);
  }
}
