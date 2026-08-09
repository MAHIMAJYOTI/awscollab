# AWS Collaboration Platform

Real-time chat, meetings, video calls, and collaborative coding.

**Current focus:** fix and test everything locally first, then connect real AWS DynamoDB, then deploy later.

## Features

- Real-time chat (Socket.IO)
- User authentication (custom API)
- Meeting scheduling and instant meetings
- WebRTC video calls
- Collaborative code editor and JDoodle execution

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React (`jellylemonshake/`) |
| Backend | Node.js, Express, Socket.IO (`backend/`) |
| Database | AWS DynamoDB (or local file store for dev) |

## Development phases

### Phase 1 — Local (no AWS) ← you are here

Uses `backend/data/local-db.json`. No AWS account needed.

```bash
# Terminal 1
cd backend
cp .env.example .env   # USE_LOCAL_STORE=true by default
npm install
npm start

# Terminal 2
cd jellylemonshake
npm install
npm start
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:5000  

### Phase 2 — Local + real AWS DynamoDB

When ready to test with real AWS:

1. In `backend/.env`:
   ```
   USE_LOCAL_STORE=false
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   ```
2. Create tables: `cd backend && npm run setup-aws` (or `npm run create-tables`)
3. (Optional) Copy local test data: included in `setup-aws`, or `npm run migrate-to-aws`
4. Verify: `npm run check-setup`
5. Check live status: `GET http://localhost:5000/api/setup/status`
6. Restart backend

Frontend stays on `http://localhost:5000` via `jellylemonshake/.env.development`.

### Phase 2b — Docker (optional, no AWS needed)

**Install Docker Desktop (one-time):**
1. Download: https://www.docker.com/products/docker-desktop/
2. Run installer → enable WSL 2 when asked → restart if prompted
3. Open **Docker Desktop** and wait until it says **Engine running**

**Run the full stack in containers:**
```bash
# Stop any local npm servers on ports 3000/5000 first
npm run docker:up
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:5000  
- Uses local JSON storage (`USE_LOCAL_STORE=true`) — **no AWS account**

Stop containers: `npm run docker:down`

**Note:** Your existing `backend/data/` folder is mounted into the container, so rooms/users/messages are preserved.

### Phase 3 — Deploy (later)

Deploy only after local + AWS testing passes. See `AWS_DEPLOYMENT_GUIDE.md` when you get there.

## Project layout

```
awsproject/
├── jellylemonshake/   # React frontend
├── backend/           # Express + Socket.IO API
│   └── data/          # Local DB (gitignored) when USE_LOCAL_STORE=true
├── docker-compose.yml
└── AWS_DEPLOYMENT_GUIDE.md
```

## GitHub

https://github.com/MAHIMAJYOTI/awscollab
