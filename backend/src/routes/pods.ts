import { Router } from 'express';

import { getSnapshot } from '../db/snapshots.js';
import { asyncHandler, findByNamespaceAndName } from './helpers.js';

export const podsRouter = Router();

podsRouter.get('/', asyncHandler(async (_req, res) => {
  const items = await getSnapshot<unknown[]>('pods', 'list');
  res.json(items ?? []);
}));

podsRouter.get('/:namespace/:name/logs', asyncHandler(async (req, res) => {
  const namespace = String(req.params.namespace);
  const name = String(req.params.name);
  const key = `${namespace}/${name}`;
  const logs = await getSnapshot<Record<string, unknown>>('pods', 'logs');
  res.json(logs?.[key] ?? []);
}));

podsRouter.get('/:namespace/:name/metrics', asyncHandler(async (req, res) => {
  const namespace = String(req.params.namespace);
  const name = String(req.params.name);
  const key = `${namespace}/${name}`;
  const metrics = await getSnapshot<Record<string, unknown>>('pods', 'metrics');
  const payload = metrics?.[key] ?? null;

  if (!payload) {
    res.status(404).json({ message: `Pod metrics not found for ${key}` });
    return;
  }

  res.json(payload);
}));

podsRouter.get('/:namespace/:name', asyncHandler(async (req, res) => {
  const namespace = String(req.params.namespace);
  const name = String(req.params.name);
  const items = (await getSnapshot<Array<{ namespace: string; name: string }>>('pods', 'list')) ?? [];
  const payload = findByNamespaceAndName(items, namespace, name);

  if (!payload) {
    res.status(404).json({ message: `Pod not found: ${namespace}/${name}` });
    return;
  }

  res.json(payload);
}));
