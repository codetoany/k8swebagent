import { Router } from 'express';

import { getSnapshot } from '../db/snapshots.js';
import { asyncHandler, findByName } from './helpers.js';

export const nodesRouter = Router();

nodesRouter.get('/', asyncHandler(async (_req, res) => {
  const items = await getSnapshot<unknown[]>('nodes', 'list');
  res.json(items ?? []);
}));

nodesRouter.get('/:name/metrics', asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  const metrics = await getSnapshot<Record<string, unknown>>('nodes', 'metrics');
  const payload = metrics?.[name] ?? null;

  if (!payload) {
    res.status(404).json({ message: `Node metrics not found for ${name}` });
    return;
  }

  res.json(payload);
}));

nodesRouter.get('/:name', asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  const items = (await getSnapshot<Array<{ name: string }>>('nodes', 'list')) ?? [];
  const payload = findByName(items, name);

  if (!payload) {
    res.status(404).json({ message: `Node not found: ${name}` });
    return;
  }

  res.json(payload);
}));
