import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { getSnapshot } from '../db/snapshots.js';

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export async function sendSnapshot(res: Response, scope: string, key: string): Promise<void> {
  const payload = await getSnapshot(scope, key);
  if (payload === null) {
    res.status(404).json({ message: `Snapshot not found for ${scope}/${key}` });
    return;
  }

  res.json(payload);
}

export function findByName<T extends { name: string }>(items: T[], name: string): T | null {
  return items.find((item) => item.name === name) ?? null;
}

export function findByNamespaceAndName<T extends { namespace: string; name: string }>(
  items: T[],
  namespace: string,
  name: string
): T | null {
  return items.find((item) => item.namespace === namespace && item.name === name) ?? null;
}
