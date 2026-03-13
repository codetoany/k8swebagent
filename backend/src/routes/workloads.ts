import { Router } from 'express';

import { getSnapshot } from '../db/snapshots.js';
import { asyncHandler, findByNamespaceAndName } from './helpers.js';

export const workloadsRouter = Router();

function registerReadOnlyResource(scope: string, basePath: string, router: Router): void {
  router.get(`/${basePath}`, asyncHandler(async (_req, res) => {
    const items = await getSnapshot<unknown[]>(scope, 'list');
    res.json(items ?? []);
  }));

  router.get(`/${basePath}/:namespace/:name`, asyncHandler(async (req, res) => {
    const namespace = String(req.params.namespace);
    const name = String(req.params.name);
    const items = (await getSnapshot<Array<{ namespace: string; name: string }>>(scope, 'list')) ?? [];
    const payload = findByNamespaceAndName(items, namespace, name);

    if (!payload) {
      res.status(404).json({ message: `${scope} not found: ${namespace}/${name}` });
      return;
    }

    res.json(payload);
  }));
}

registerReadOnlyResource('deployments', 'deployments', workloadsRouter);
registerReadOnlyResource('statefulsets', 'statefulsets', workloadsRouter);
registerReadOnlyResource('daemonsets', 'daemonsets', workloadsRouter);
registerReadOnlyResource('cronjobs', 'cronjobs', workloadsRouter);
