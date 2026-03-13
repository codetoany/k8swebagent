import { Pool } from 'pg';

import { config } from '../config.js';
import { getCachedJson, setCachedJson } from '../cache/redis.js';
import { snapshotSeeds } from '../data/seedSnapshots.js';

const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password
});

export async function initDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_snapshots (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, key)
    )
  `);

  const countResult = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM api_snapshots');
  const count = Number(countResult.rows[0]?.count ?? '0');

  if (count > 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const snapshot of snapshotSeeds) {
      await client.query(
        `
          INSERT INTO api_snapshots (scope, key, payload)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (scope, key) DO NOTHING
        `,
        [snapshot.scope, snapshot.key, JSON.stringify(snapshot.payload)]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSnapshot<T>(scope: string, key: string): Promise<T | null> {
  const cacheKey = `snapshot:${scope}:${key}`;
  const cached = await getCachedJson<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const result = await pool.query<{ payload: T }>(
    'SELECT payload FROM api_snapshots WHERE scope = $1 AND key = $2',
    [scope, key]
  );

  const payload = result.rows[0]?.payload ?? null;
  if (payload !== null) {
    await setCachedJson(cacheKey, payload);
  }

  return payload;
}

export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
