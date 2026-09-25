import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ping API',
      version: '1.0.0',
      description: `
## Ping — Dating App Backend API (v1)

Single-profile, swipe-based dating API. Discover nearby users, swipe left/right, match, and chat.

### Authentication

All \`🔒\` endpoints require:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

### OTP Auth Flow

1. **Signup:** \`POST /api/v1/auth/signup\` → client SDK sends OTP → \`POST /api/v1/auth/verify-otp\` (with Firebase ID token as session)
2. **Login:** \`POST /api/v1/auth/login\` → client SDK sends OTP → \`POST /api/v1/auth/login/verify-otp\`
3. **Google OAuth:** \`POST /api/v1/auth/google/callback\` (with Google ID token)

### Socket.IO Events (Phase 4)

Connect to \`ws://localhost:5000\` with:
\`\`\`
{ auth: { token: "<access_token>" } }
\`\`\`

| Client → Server | Payload | Description |
|---|---|---|
| \`send_message\` | \`{ chatId, content, message_type }\` | Send a message |
| \`message_read\` | \`{ chatId }\` | Mark messages as read |
| \`typing\` | \`{ chatId }\` | Broadcast typing indicator |
| \`stop_typing\` | \`{ chatId }\` | Stop typing indicator |
| \`location_update\` | \`{ latitude, longitude }\` | Stream location update |

| Server → Client | Payload | Description |
|---|---|---|
| \`new_message\` | \`{ message }\` | Incoming message |
| \`presence_update\` | \`{ userId, online }\` | Online/offline status |
| \`match_created\` | \`{ match, chat }\` | New match notification |
| \`user_typing\` | \`{ userId, chatId }\` | Typing indicator |

### Standard Error Envelope
\`\`\`json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Human-readable message",
  "details": "Field-specific detail"
}
\`\`\`
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
        SuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            code: {
              type: 'string',
              enum: [
                'VALIDATION_ERROR',
                'UNAUTHORIZED',
                'FORBIDDEN',
                'NOT_FOUND',
                'CONFLICT',
                'RATE_LIMIT_EXCEEDED',
                'INTERNAL_ERROR',
              ],
            },
            message: { type: 'string' },
            details: { type: 'string', nullable: true },
          },
        },
        Photo: {
          type: 'object',
          properties: {
            photo_id: { type: 'string', format: 'uuid' },
            photo_url: { type: 'string' },
            is_profile_picture: { type: 'boolean' },
            order: { type: 'integer' },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            user_id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string' },
            birthdate: { type: 'string', format: 'date' },
            age: { type: 'integer' },
            gender: { type: 'string', enum: ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'] },
            bio: { type: 'string' },
            interests: { type: 'array', items: { type: 'string' } },
            photos: { type: 'array', items: { $ref: '#/components/schemas/Photo' } },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Match: {
          type: 'object',
          properties: {
            match_id: { type: 'string', format: 'uuid' },
            chat_id: { type: 'string', format: 'uuid' },
            matched_at: { type: 'string', format: 'date-time' },
            has_conversation: { type: 'boolean' },
            last_message: {
              type: 'object',
              nullable: true,
              properties: {
                content: { type: 'string' },
                message_type: { type: 'string', enum: ['text', 'image', 'voice'] },
                sent_at: { type: 'string', format: 'date-time' },
                sender_user_id: { type: 'string', format: 'uuid' },
              },
            },
            matched_user: {
              type: 'object',
              properties: {
                user_id: { type: 'string', format: 'uuid' },
                full_name: { type: 'string' },
                age: { type: 'integer' },
                profile_picture: { $ref: '#/components/schemas/Photo' },
              },
            },
          },
        },
        Message: {
          type: 'object',
          properties: {
            message_id: { type: 'string', format: 'uuid' },
            chat_id: { type: 'string', format: 'uuid' },
            sender_id: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            message_type: { type: 'string', enum: ['text', 'image', 'voice'] },
            is_read: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            media_url: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/v1/*.js',
    './src/routes/*.js',
    './src/middleware/validators/*.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
