import { Router } from 'express';

import { asyncHandler, sendSnapshot } from './helpers.js';

export const dashboardRouter = Router();

dashboardRouter.get('/overview', asyncHandler(async (_req, res) => sendSnapshot(res, 'dashboard', 'overview')));
dashboardRouter.get('/resource-usage', asyncHandler(async (_req, res) => sendSnapshot(res, 'dashboard', 'resource-usage')));
dashboardRouter.get('/recent-events', asyncHandler(async (_req, res) => sendSnapshot(res, 'dashboard', 'recent-events')));
dashboardRouter.get('/namespace-distribution', asyncHandler(async (_req, res) => sendSnapshot(res, 'dashboard', 'namespace-distribution')));
