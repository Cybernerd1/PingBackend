import 'dotenv/config';
import { createServer } from 'http';
import app from './src/app.js';
import pool, { connectDB } from './src/config/database.js';
import { runMigrations } from './src/db/run-migrations.js';
import { initSocket } from './src/socket/index.js';
import { startPurgeJob } from './src/jobs/purge.job.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 5000;

try {
  await connectDB();
  logger.info('Database connected');

  // Do not advertise a healthy API while its database schema is outdated.
  logger.info('Applying database migrations');
  await runMigrations(pool);
  logger.info('Database migrations completed');

  const httpServer = createServer(app);
  initSocket(httpServer);

  // Hard-delete soft-deleted accounts after the retention window +
  // expired refresh tokens. Set RUN_PURGE_JOB=false to disable.
  startPurgeJob();

  httpServer.listen(PORT, () => {
    logger.info(
      { port: PORT, env: process.env.NODE_ENV || 'development' },
      `Ping API running on port ${PORT}`
    );
    logger.info(`Swagger docs: http://localhost:${PORT}/api/docs`);
    logger.info(`Socket.IO: ws://localhost:${PORT}`);
  });
} catch (error) {
  logger.error({ err: error }, 'Server startup failed');
  process.exit(1);
}
