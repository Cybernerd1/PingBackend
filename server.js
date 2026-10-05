import 'dotenv/config';
import { createServer } from 'http';
import app from './src/app.js';
import { connectDB } from './src/config/database.js';
import { initSocket } from './src/socket/index.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 5000;

try {
  await connectDB();
  logger.info('Database connected');

  const httpServer = createServer(app);
  initSocket(httpServer);

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