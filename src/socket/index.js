import { Server } from 'socket.io';
import { initChatSocket } from './chat.socket.js';

/**
 * Singleton io instance — exported so controllers can emit events
 * (e.g., match_created notification to both users on swipe match).
 * @type {import('socket.io').Server | null}
 */
let _io = null;

export const getIO = () => {
  if (!_io) throw new Error('Socket.IO not initialized. Call initSocket() first.');
  return _io;
};

/**
 * Force-disconnect every live socket of a user (ban / delete).
 * Each socket joins its personal room `user:${userId}` on connection
 * (see chat.socket.js), so one room kick covers all their devices.
 */
export const disconnectUser = (userId) => {
  if (!_io) return 0;
  _io.in(`user:${userId}`).disconnectSockets(true);
  return true;
};

/**
 * Initializes the Socket.IO server and attaches all namespaces.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export const initSocket = (httpServer) => {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    // Transports: prefer websocket, fall back to polling
    transports: ['websocket', 'polling'],
  });

  initChatSocket(_io);

  console.log('[Socket.IO] Server initialized');
  return _io;
};
