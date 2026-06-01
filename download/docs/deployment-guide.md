# KarmaBoard — Deployment Guide

## 1. Prerequisites

Before deploying, ensure you have:

- [ ] Node.js 18+ installed
- [ ] npm or pnpm package manager
- [ ] Turso account with database created
- [ ] GitHub account with repository
- [ ] Vercel account connected to GitHub
- [ ] Resend account with API key
- [ ] (Optional) Twilio account for SMS

## 2. Local Development Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/karmaboard.git
cd karmaboard
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
```bash
cp .env.example .env
# Edit .env with your actual values
```

### Step 4: Set Up Database
```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate dev --name init

# (Optional) Seed the database with superadmin
npx prisma db seed
```

### Step 5: Start Development Server
```bash
npm run dev
```

Open http://localhost:3000

### Step 6: Open Prisma Studio (Database GUI)
```bash
npx prisma studio
```

## 3. Turso Database Configuration

### Create a Turso Database
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login to Turso
turso auth login

# Create a new database
turso db create karmaboard

# Get the database URL
turso db show karmaboard --url
# Output: libsql://karmaboard-your-org.turso.io

# Create an auth token
turso db tokens create karmaboard
```

### Update .env for Turso
```env
DATABASE_URL="libsql://karmaboard-your-org.turso.io"
TURSO_DATABASE_URL="libsql://karmaboard-your-org.turso.io"
TURSO_AUTH_TOKEN="your-token-here"
```

### Push Schema to Turso
```bash
npx prisma db push
```

## 4. Vercel Deployment

### Connect GitHub to Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel auto-detects Next.js framework

### Set Environment Variables in Vercel
Go to Vercel Dashboard > Project > Settings > Environment Variables:

| Variable | Value |
|----------|-------|
| DATABASE_URL | Your Turso database URL |
| TURSO_DATABASE_URL | Your Turso database URL |
| TURSO_AUTH_TOKEN | Your Turso auth token |
| NEXTAUTH_URL | Your Vercel domain (https://your-app.vercel.app) |
| NEXTAUTH_SECRET | A secure random string (generate with `openssl rand -base64 32`) |
| RESEND_API_KEY | Your Resend API key |

### Deploy
```bash
# Automatic: Push to main branch triggers deployment
git push origin main

# Or deploy via Vercel CLI
npm i -g vercel
vercel --prod
```

### Run Migrations on Vercel
After first deployment, run:
```bash
npx prisma migrate deploy
```

## 5. Resend Email Setup

### Create Resend Account
1. Go to https://resend.com
2. Sign up and verify your email domain
3. Get your API key from the dashboard

### Test Email
```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "KarmaBoard <noreply@yourdomain.com>",
    "to": ["test@example.com"],
    "subject": "Test Email",
    "html": "<p>Email from KarmaBoard</p>"
  }'
```

## 6. Twilio SMS Setup (Optional)

### Create Twilio Account
1. Go to https://www.twilio.com
2. Get Account SID, Auth Token
3. Purchase a phone number

### Environment Variables
```env
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="your-token"
TWILIO_PHONE_NUMBER="+1XXXXXXXXXX"
```

## 7. GLM Agent Mode Setup (Future)

### GitHub Access
1. Go to GitHub Settings > Developer Settings > Personal Access Tokens
2. Create a fine-grained token with repo access
3. Add to Vercel environment variables:
   ```env
   GITHUB_TOKEN="ghp_..."
   ```

### Vercel API Access
1. Go to Vercel Dashboard > Account > Tokens
2. Create a new token
3. Add to environment variables:
   ```env
   VERCEL_TOKEN="your-vercel-token"
   VERCEL_PROJECT_ID="your-project-id"
   ```

## 8. Production Checklist

Before going live, verify:

- [ ] All environment variables are set in Vercel
- [ ] Database migrations have run successfully
- [ ] Superadmin seed script has been executed
- [ ] NextAuth secret is a strong random string
- [ ] HTTPS is enabled (Vercel does this automatically)
- [ ] Email domain is verified in Resend
- [ ] Test all critical flows: register, login, clock in/out, create project
- [ ] Error pages (404, 500) are customized
- [ ] Rate limiting is configured for auth endpoints

## 9. Monitoring & Maintenance

### Recommended Production Tools
| Tool | Purpose | Setup |
|------|---------|-------|
| Vercel Analytics | Performance monitoring | Enable in Vercel dashboard |
| Sentry | Error tracking | Create account, add SDK |
| Upstash Redis | Rate limiting | Optional, for production security |

### Regular Maintenance Tasks
- Update dependencies monthly: `npm audit && npm update`
- Backup Turso database: `turso db dump karmaboard > backup.sql`
- Review activity logs weekly
- Monitor time tracking accuracy
