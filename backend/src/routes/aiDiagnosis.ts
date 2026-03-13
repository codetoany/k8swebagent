import { Router } from 'express';

import { asyncHandler, sendSnapshot } from './helpers.js';

export const aiDiagnosisRouter = Router();

aiDiagnosisRouter.get('/history', asyncHandler(async (_req, res) => sendSnapshot(res, 'ai-diagnosis', 'history')));
aiDiagnosisRouter.get('/node-status', asyncHandler(async (_req, res) => sendSnapshot(res, 'ai-diagnosis', 'node-status')));
