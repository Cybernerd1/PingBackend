# ⚡ Ping Backend API (`pingbckd`)

A production-ready, real-time backend API built with Express 5, PostgreSQL (NeonDB), Drizzle ORM, Passport.js, and Socket.IO for the **Ping** dating app platform.

---

## 🚀 Features

- 🔐 **Authentication & Authorization**
  - Email & Password registration/login with bcrypt password hashing
  - Google OAuth2 integration (`passport-google-oauth20` + `google-auth-library` ID token verification)
  - JWT Authentication (Access Tokens & Refresh Tokens stored in HttpOnly cookies)
- 👤 **User & Profile Management**
  - Onboarding profile setup (gender, interest, bio, age, location, photos)
  - Cloudinary media integration with Multer file upload support
- 🔥 **Swipe & Discovery Engine**
  - Tinder-like user discovery recommendations filtered by age and preference
  - Like, Pass, and Superlike actions with instant mutual match detection
- 💬 **Real-time Chat with Socket.IO**
  - Dedicated `/chat` Socket.IO namespace with token authentication
  - Instant message delivery and storage in PostgreSQL
  - Typing indicators (`typing:start`, `typing:stop`)
  - Real-time message status ticks (`sent` single tick, `delivered`/`read` double ticks)
- 📚 **API Documentation**
  - OpenAPI 3.0 specification generated dynamically via `swagger-jsdoc`
  - Interactive UI hosted on `/api/docs` via `swagger-ui-express`

---

## 🛠 Tech Stack

- **Runtime:** Node.js (ES Modules, `"type": "module"`)
- **Framework:** Express.js v5
- **Database:** PostgreSQL (NeonDB serverless)
- **ORM:** Drizzle ORM & Drizzle Kit
- **Real-time Engine:** Socket.IO v4
- **Auth:** Passport.js, JWT (`jsonwebtoken`), `bcryptjs`
- **File Storage:** Cloudinary (`multer-storage-cloudinary`)
- **API Docs:** Swagger (`swagger-ui-express`, `swagger-jsdoc`)

---

## 📋 Environment Variables

Create a `.env` file in the root of `pingbckd` based on `.env.example`:

```ini
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Connection (NeonDB / PostgreSQL)
DATABASE_URL=postgresql://user:password@ep-cool-db.us-east-2.aws.neon.tech/pingdb?sslmode=require

# JWT Secrets & Expiration
JWT_ACCESS_SECRET=your_jwt_access_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Deep Link Scheme for Mobile App Redirects
MOBILE_DEEP_LINK=pingapp://auth/callback

# Cloudinary Storage Credentials
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

---

## 🏁 Getting Started

### 1. Installation

```bash
cd pingbckd
npm install
```

### 2. Database Migration

Generate Drizzle schema files and apply migrations to your NeonDB PostgreSQL database:

```bash
# Generate SQL migration files
npm run db:generate

# Execute migration scripts against PostgreSQL
npm run db:migrate

# (Optional) Open Drizzle Studio UI to view database tables
npm run db:studio
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start at `http://localhost:5000`.

---

## 📖 API Documentation & Swagger

Once the server is running, visit:
👉 **`http://localhost:5000/api/docs`**

You will find full interactive documentation for all endpoints:

- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Password login
- `POST /api/auth/google` - Google ID token login (Mobile)
- `GET /api/auth/google` - Web Google OAuth redirect flow
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/onboarding/profile` - Get user profile
- `POST /api/onboarding/profile` - Save user profile setup
- `GET /api/chat/recommendations` - Discover potential matches
- `POST /api/chat/swipe` - Swipe action (`like`, `pass`, `superlike`)
- `GET /api/chat/conversations` - Fetch match list & chat conversations
- `GET /api/chat/conversations/:id/messages` - Fetch conversation message history

---

## 🔌 Socket.IO Real-time Events

Connect to namespace: `http://localhost:5000/chat`

**Handshake Auth:**
```javascript
const socket = io("http://localhost:5000/chat", {
  auth: { token: "YOUR_JWT_ACCESS_TOKEN" }
});
```

**Client Emits:**
- `send_message`: `{ conversationId, recipientId, text }`
- `typing_start`: `{ conversationId, recipientId }`
- `typing_stop`: `{ conversationId, recipientId }`
- `mark_read`: `{ messageId, conversationId }`

**Client Listens:**
- `new_message`: Triggers on incoming message
- `message_sent`: Single tick acknowledgement `{ messageId, timestamp }`
- `message_delivered`: Double tick status `{ messageId }`
- `user_typing`: `{ conversationId, userId, isTyping: true }`
- `user_stop_typing`: `{ conversationId, userId, isTyping: false }`

---

## 📁 Project Structure

```
pingbckd/
├── server.js               # Entry point (Express + HTTP + Socket.IO)
├── drizzle.config.js       # Drizzle ORM configuration
├── package.json
├── .env.example
└── src/
    ├── app.js              # Express middleware & route bindings
    ├── config/             # DB, Passport, Swagger, Cloudinary setup
    ├── controllers/        # Auth, Onboarding, Chat handlers
    ├── db/                 # Drizzle database schemas & migration script
    ├── middleware/         # Auth, validation, upload middlewares
    ├── routes/             # Express API routes
    ├── socket/             # Socket.IO connection manager & chat events
    └── utils/              # JWT & utility helpers
```
