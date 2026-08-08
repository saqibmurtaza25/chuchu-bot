import { z } from 'zod';

/**
 * Zod Schema for CHUCHU Backend Environment & System Configuration
 */
const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().int().positive().default(8080),
  host: z.string().default('0.0.0.0'),
  corsOrigin: z.string().default('*'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  binanceWsUrl: z.string().url().default('wss://fstream.binance.com/stream'),
  binanceRestUrl: z.string().url().default('https://fapi.binance.com'),
  maxSymbolsTracked: z.number().int().positive().default(50),
  paperTradingInitialBalance: z.number().positive().default(100000)
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * ConfigService
 * Singleton configuration manager validating environment variables against Zod schema.
 */
export class ConfigService {
  private static instance: ConfigService;
  private readonly config: AppConfig;

  private constructor(customEnv?: Record<string, any>) {
    const rawEnv = customEnv || {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      host: process.env.HOST,
      corsOrigin: process.env.CORS_ORIGIN,
      logLevel: process.env.LOG_LEVEL,
      binanceWsUrl: process.env.BINANCE_WS_URL,
      binanceRestUrl: process.env.BINANCE_REST_URL,
      maxSymbolsTracked: process.env.MAX_SYMBOLS ? parseInt(process.env.MAX_SYMBOLS, 10) : undefined,
      paperTradingInitialBalance: process.env.PAPER_BALANCE ? parseFloat(process.env.PAPER_BALANCE) : undefined
    };

    // Filter out undefined values to let Zod defaults apply cleanly
    const cleanedEnv = Object.fromEntries(
      Object.entries(rawEnv).filter(([_, v]) => v !== undefined)
    );

    const parseResult = ConfigSchema.safeParse(cleanedEnv);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`ConfigService Initialization Failed: ${errorMsg}`);
    }

    this.config = parseResult.data;
  }

  public static getInstance(customEnv?: Record<string, any>): ConfigService {
    if (!ConfigService.instance || customEnv) {
      ConfigService.instance = new ConfigService(customEnv);
    }
    return ConfigService.instance;
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public getAll(): AppConfig {
    return { ...this.config };
  }
}
