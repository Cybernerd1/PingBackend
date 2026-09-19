import { Server } from 'socket.io';
import { initChatSocket } from './chat.socket.js';

/**
 * Initializes Socket.IO server on the given HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  initChatSocket(io);

  console.log('[Socket.IO] Server initialized');
  return io;
};
