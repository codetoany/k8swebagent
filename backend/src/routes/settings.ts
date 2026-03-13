import { Router } from 'express';

import { asyncHandler, sendSnapshot } from './helpers.js';

export const settingsRouter = Router();

settingsRouter.get('/', asyncHandler(async (_req, res) => sendSnapshot(res, 'settings', 'system')));
settingsRouter.get('/ai-models', asyncHandler(async (_req, res) => sendSnapshot(res, 'settings', 'ai-models')));
