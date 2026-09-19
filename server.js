import 'dotenv/config';
import { createServer } from 'http';
import app from './src/app.js';
import { connectDB } from './src/config/database.js';
import { initSocket } from './src/socket/index.js';

const PORT = process.env.PORT || 5000;

try {
  await connectDB();

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`Swagger docs: http://localhost:${PORT}/api/docs`);
  });
} catch (error) {
  console.error('Server startup failed:', error.message);
  process.exit(1);
}