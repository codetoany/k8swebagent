import { Router } from 'express';

import { asyncHandler, sendSnapshot } from './helpers.js';

export const authRouter = Router();

authRouter.get('/user-info', asyncHandler(async (_req, res) => sendSnapshot(res, 'auth', 'user-info')));
