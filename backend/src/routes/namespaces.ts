import { Router } from 'express';

import { getSnapshot } from '../db/snapshots.js';
import { asyncHandler, findByName } from './helpers.js';

export const namespacesRouter = Router();

namespacesRouter.get('/', asyncHandler(async (_req, res) => {
  const items = await getSnapshot<unknown[]>('namespaces', 'list');
  res.json(items ?? []);
}));

namespacesRouter.get('/:name', asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  const items = (await getSnapshot<Array<{ name: string }>>('namespaces', 'list')) ?? [];
  const payload = findByName(items, name);

  if (!payload) {
    res.status(404).json({ message: `Namespace not found: ${name}` });
    return;
  }

  res.json(payload);
}));
