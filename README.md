# CloudCollab — AWS Collaboration Platform

Real-time chat, meetings, WebRTC video calls, collaborative editing, and multi-language code execution — deployed on AWS.

## Live demo

| Service | URL |
|---------|-----|
| **App** | http://cloudcollab-frontend-545595341712.s3-website-us-east-1.amazonaws.com |
| **API** | http://awsproject-backend-prod.eba-2aum2wgj.us-east-1.elasticbeanstalk.com |
| **Health** | http://awsproject-backend-prod.eba-2aum2wgj.us-east-1.elasticbeanstalk.com/health |

## Features

- **Real-time chat** — Socket.IO rooms, typing indicators, message search
- **Authentication** — signup/login, bcrypt hashing, forgot/reset password
- **Meetings** — schedule, join, instant meetings
- **Video calls** — WebRTC peer connections with socket-based signaling
- **Collaborative editor** — shared document editing in chat rooms
- **Code execution** — JDoodle API (12+ languages) with local fallback for Node.js/Python
- **Admin panel** — room members, moderation

## Architecture

```
Browser (React on S3)
        │  REST + WebSocket
        ▼
Elastic Beanstalk (Node.js + Express + Socket.IO)
        │
        ▼
DynamoDB (6 on-demand tables)
  ChatRooms · Messages · Meetings · Users · Projects · ProjectFiles
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React (`jellylemonshake/`) |
| Backend | Node.js, Express, Socket.IO (`backend/`) |
| Database | AWS DynamoDB (or local JSON file for offline dev) |
| Deploy | S3 static hosting + Elastic Beanstalk |

## Quick start (local)

### Option A — Local file store (no AWS account)

```powershell
# Terminal 1 — backend
cd backend
cp .env.example .env          # USE_LOCAL_STORE=true by default
npm install
npm start

# Terminal 2 — frontend
cd jellylemonshake
npm install
npm start
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

Data is stored in `backend/data/local-db.json` (gitignored).

### Option B — Local dev + AWS DynamoDB

1. Set in `backend/.env`:
   ```env
   USE_LOCAL_STORE=false
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   ```
2. Create tables and migrate data:
   ```powershell
   cd backend
   npm run setup-aws
   ```
3. Verify: `npm run check-setup` or `GET http://localhost:5000/api/setup/status`
4. Start backend and frontend as above.

### Option C — Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```powershell
npm run docker:up      # start
npm run docker:down    # stop
```

Uses local JSON storage — no AWS credentials needed. Your existing `backend/data/` folder is mounted into the container.

## Deploy to AWS

One-command deploy (uses credentials from `backend/.env`):

```powershell
cd backend
npm run deploy:aws
```

Or from the project root: `npm run deploy:aws`

See **[DEPLOY_AWS.md](./DEPLOY_AWS.md)** for IAM permissions, architecture details, and troubleshooting.

### Required IAM policies (deploy user)

| Policy | Purpose |
|--------|---------|
| `AmazonDynamoDBFullAccess` | Database |
| `AmazonS3FullAccess` | Frontend + deploy artifacts |
| `AdministratorAccess-AWSElasticBeanstalk` | Backend hosting |
| `IAMFullAccess` | EB instance roles (first deploy only) |

## Project layout

```
awsproject/
├── jellylemonshake/          # React frontend
├── backend/                  # Express + Socket.IO API
│   ├── config/               # DynamoDB + local store adapters
│   ├── scripts/              # AWS setup, migration, deploy
│   ├── data/                 # Local DB (gitignored)
│   └── .ebextensions/        # Elastic Beanstalk config
├── docker-compose.yml
├── DEPLOY_AWS.md             # Deployment guide
└── AWS_DEPLOYMENT_GUIDE.md   # Legacy bash deploy scripts
```

## Useful scripts

| Command | Location | Description |
|---------|----------|-------------|
| `npm start` | `backend/` | Start API server |
| `npm start` | `jellylemonshake/` | Start React dev server |
| `npm run setup-aws` | `backend/` | Create DynamoDB tables + migrate local data |
| `npm run deploy:aws` | `backend/` | Deploy to Elastic Beanstalk + S3 |
| `npm run docker:up` | root | Run full stack in Docker |

## Environment variables

Copy `backend/.env.example` → `backend/.env`. Key settings:

| Variable | Description |
|----------|-------------|
| `USE_LOCAL_STORE` | `true` = local JSON file, `false` = AWS DynamoDB |
| `AWS_REGION` | AWS region (default `us-east-1`) |
| `JDOODLE_CLIENT_ID` / `JDOODLE_CLIENT_SECRET` | Code execution API (optional) |
| `FRONTEND_URL` | Used in password-reset email links |

Frontend URLs are set in `jellylemonshake/.env.development` (local) and baked in at build time for production deploy.

## GitHub

https://github.com/MAHIMAJYOTI/awscollab

## Notes

- **Video calls in production** may require HTTPS (browsers restrict camera access on HTTP). Chat, auth, and meetings work over HTTP.
- Started as a team project; rebuilt and extended with working chat, video, AWS integration, and full deployment.
