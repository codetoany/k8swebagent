import RedisPackage from 'ioredis';

import { config } from '../config.js';

type RedisClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: string, ttlSeconds: number) => Promise<unknown>;
  quit: () => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

const RedisCtor = (RedisPackage as unknown as { default?: new (...args: any[]) => RedisClient }).default
  ?? (RedisPackage as unknown as new (...args: any[]) => RedisClient);

let redisClient: RedisClient | null | undefined;

async function createClient(): Promise<RedisClient | null> {
  if (!config.redis.enabled) {
    return null;
  }

  const client = new RedisCtor(config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  try {
    await client.connect();
    client.on('error', () => {
      // Ignore cache errors and keep PostgreSQL as source of truth.
    });
    return client;
  } catch {
    await client.quit().catch(() => undefined);
    return null;
  }
}

export async function getRedisClient(): Promise<RedisClient | null> {
  if (redisClient !== undefined) {
    return redisClient;
  }

  redisClient = await createClient();
  return redisClient;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const value = await client.get(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds = config.redis.ttlSeconds): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}
