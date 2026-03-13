import cors from 'cors';
import express from 'express';

import { getRedisClient } from './cache/redis.js';
import { config } from './config.js';
import { initDatabase, pingDatabase } from './db/snapshots.js';
import { aiDiagnosisRouter } from './routes/aiDiagnosis.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { namespacesRouter } from './routes/namespaces.js';
import { nodesRouter } from './routes/nodes.js';
import { podsRouter } from './routes/pods.js';
import { asyncHandler } from './routes/helpers.js';
import { settingsRouter } from './routes/settings.js';
import { workloadsRouter } from './routes/workloads.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', asyncHandler(async (_req, res) => {
  await pingDatabase();
  const redis = await getRedisClient();
  res.json({
    status: 'ok',
    database: 'up',
    redis: redis ? 'up' : 'disabled'
  });
}));

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/pods', podsRouter);
app.use('/api', workloadsRouter);
app.use('/api/namespaces', namespacesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai-diagnosis', aiDiagnosisRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function main(): Promise<void> {
  await initDatabase();
  await getRedisClient();

  app.listen(config.port, () => {
    console.log(`k8s-agent-backend listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
