# NexusAI — Full Stack AI Chatbot with MongoDB

## Tech Stack
- **Frontend:** React + Tailwind-style CSS
- **Backend:** Node.js + Express
- **Database:** MongoDB (via Mongoose)
- **AI:** Claude API (Anthropic) with streaming

## Features
- User register/login with JWT auth
- Multiple chat sessions per user (stored in MongoDB)
- Sessions persist across server restarts
- Auto-title sessions from first message
- Rename & delete sessions
- Real-time streaming responses
- Markdown rendering

## Setup

### 1. Install MongoDB
Download from https://www.mongodb.com/try/download/community
Or use MongoDB Atlas (free cloud): https://www.mongodb.com/atlas

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
node server.js
```

### 3. Frontend
```bash
cd frontend
npm install
npm start
```

## .env file (backend/.env)
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
JWT_SECRET=any-random-string
MONGO_URI=mongodb://localhost:27017/nexusai
PORT=5000
```

## MongoDB Atlas (cloud - easier)
1. Go to https://www.mongodb.com/atlas
2. Create free cluster
3. Get connection string
4. Set MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/nexusai
