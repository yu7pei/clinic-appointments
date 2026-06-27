export interface AppConfig {
  readonly port: number;
  /** SQLite database file path. */
  readonly databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? './data/clinic.db',
  };
}
