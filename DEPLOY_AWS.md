# Deploy CloudCollab to AWS (Windows)

## One-time: IAM permissions for user `mahi`

Your IAM user needs more than DynamoDB. In **AWS Console → IAM → Users → mahi → Add permissions → Attach policies directly**, attach:

| Policy | Why |
|--------|-----|
| `AmazonS3FullAccess` | Frontend hosting + deployment artifacts |
| `AdministratorAccess-AWSElasticBeanstalk` | Backend API hosting (replaces deprecated `AWSElasticBeanstalkFullAccess`) |
| `IAMFullAccess` | Create EB instance roles (first deploy only) |

> **Tip:** For production you'd use scoped policies; these managed policies are fine for a portfolio/demo account.

## Deploy (uses `backend/.env` credentials — no `aws configure` needed)

```powershell
cd c:\Users\mahij\awsproject\backend
npm run deploy:aws
```

First run creates S3 buckets, Elastic Beanstalk app/environment (~5–10 min), deploys backend, builds React, uploads frontend.

### Phases (optional)

```powershell
node scripts/deployToAws.js setup     # S3 + EB environment only
node scripts/deployToAws.js backend   # Backend zip → Elastic Beanstalk
node scripts/deployToAws.js frontend  # React build → S3
```

## Architecture

```
Browser → S3 static site (React)
              ↓ API / WebSocket
         Elastic Beanstalk (Node.js + Socket.IO)
              ↓
         DynamoDB (6 tables — already configured)
```

## After deploy

URLs are printed at the end and saved in `backend/.deploy-state.json` (gitignored).

- **Health check:** `http://<eb-url>/health`
- **Login:** use your existing account (e.g. `mahijyoti883@gmail.com`)

## Troubleshooting

| Error | Fix |
|-------|-----|
| `s3:CreateBucket` AccessDenied | Attach `AmazonS3FullAccess` to `mahi` |
| `elasticbeanstalk:*` AccessDenied | Attach `AdministratorAccess-AWSElasticBeanstalk` |
| EB environment Grey / unhealthy | Check EB logs in console; ensure EC2 role has DynamoDB access |
| CORS errors | S3 website URLs are already allowed in `backend/index.js` |
| Video call fails in prod | Browsers require HTTPS for camera; consider CloudFront + ACM cert later |

## EB environment variables (set automatically)

- `USE_LOCAL_STORE=false`
- `AWS_REGION=us-east-1`
- `FRONTEND_URL` → S3 website URL
- `JDOODLE_*` from your `.env` if configured

DynamoDB access on EB uses the **EC2 instance profile** (`aws-elasticbeanstalk-ec2-role`) — no access keys on the server.
