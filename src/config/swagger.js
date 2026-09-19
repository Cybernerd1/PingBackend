import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ping API',
      version: '1.0.0',
      description: `
## Ping — Dating App Backend API

Real-time dating app API with Google OAuth, email/password auth, onboarding, and Socket.IO chat.

### Socket.IO Events

Connect to \`ws://localhost:5000\` with:
\`\`\`
{ auth: { token: "<access_token>" } }
\`\`\`

| Client → Server | Payload | Description |
|---|---|---|
| \`join_conversation\` | \`{ conversationId }\` | Join a chat room |
| \`send_message\` | \`{ conversationId, content }\` | Send a message |
| \`message_read\` | \`{ conversationId }\` | Mark messages as read (blue ticks) |
| \`typing\` | \`{ conversationId }\` | Broadcast typing indicator |
| \`stop_typing\` | \`{ conversationId }\` | Stop typing indicator |

| Server → Client | Payload | Description |
|---|---|---|
| \`new_message\` | \`{ message }\` | Incoming message |
| \`message_status\` | \`{ conversationId, status, ... }\` | Tick update (delivered/read) |
| \`user_typing\` | \`{ userId, conversationId }\` | Other user is typing |
| \`user_stop_typing\` | \`{ userId, conversationId }\` | Stopped typing |
| \`user_online\` | \`{ userId }\` | User came online |
| \`user_offline\` | \`{ userId }\` | User went offline |

### Message Status (Ticks)
- **sent** → 🕐 Single grey tick (saved to DB)
- **delivered** → ✔✔ Double grey ticks (recipient online)
- **read** → ✔✔ Double blue ticks (recipient viewed)
      `,
    },
    servers: [
      {
        url: '/api',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user1Id: { type: 'string', format: 'uuid' },
            user2Id: { type: 'string', format: 'uuid' },
            lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            partner: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                username: { type: 'string' },
                googleAvatar: { type: 'string', nullable: true },
              },
            },
            lastMessage: { $ref: '#/components/schemas/Message' },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            conversationId: { type: 'string', format: 'uuid' },
            senderId: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            status: {
              type: 'string',
              enum: ['sent', 'delivered', 'read'],
              description: 'sent=single grey tick, delivered=double grey ticks, read=double blue ticks',
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/*.js',
    './src/middleware/validators/*.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
