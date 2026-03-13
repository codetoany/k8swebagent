import 'dotenv/config';

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true' || value === '1';
}

export const config = {
  port: toNumber(process.env.PORT, 8080),
  pg: {
    host: process.env.POSTGRES_HOST ?? 'postgres',
    port: toNumber(process.env.POSTGRES_PORT, 5432),
    database: process.env.POSTGRES_DB ?? 'k8s_agent',
    user: process.env.POSTGRES_USER ?? 'k8s_agent',
    password: process.env.POSTGRES_PASSWORD ?? 'k8s_agent'
  },
  redis: {
    enabled: toBoolean(process.env.REDIS_ENABLED, true),
    url: process.env.REDIS_URL ?? 'redis://redis:6379',
    ttlSeconds: toNumber(process.env.REDIS_TTL_SECONDS, 60)
  }
};
