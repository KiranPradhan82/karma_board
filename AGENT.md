# AGENT.md — Project Instructions for AI Agents

> **MANDATORY**: Read this file FIRST at the start of every session. Follow all rules and conventions defined here. Never ask the user about anything already documented in this file.

---

## 1. PROJECT OVERVIEW

### Project Name: TeamForge PM
### Type: Full-stack Project Management Web Application
### Description: A project management platform for managing teams, projects, time tracking, and AI-assisted development. The superadmin can manage the entire organization, assign roles, track work hours, and leverage GLM AI for project development.

### Primary Language: English (all code comments, commits, UI text in English)
### Communication Style: Direct, concise, professional. Avoid fluff. Get to the point.

---

## 2. TECH STACK (LOCKED — DO NOT CHANGE WITHOUT USER APPROVAL)

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router) | 15+/16 |
| Language | TypeScript | Strict mode |
| Database | Turso (libSQL / SQLite) | Latest |
| ORM | Prisma | 5.x+ |
| Authentication | NextAuth.js v5 (Auth.js) | Latest |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | Latest |
| Icons | Lucide React | Latest |
| Forms | React Hook Form + Zod | Latest |
| Notifications (Toast) | Sonner | Latest |
| Email | Resend | Latest |
| SMS | Twilio | Latest |
| AI SDK | z-ai-web-dev-sdk (GLM) | Built-in |
| Date Utilities | date-fns | Latest |
| Charts | Recharts | Latest |
| Deployment | Vercel | Latest |
| Package Manager | npm | Default |

### DO NOT introduce new dependencies without asking the user first.

---

## 3. PROJECT STRUCTURE

```
teamforge-pm/
├── AGENT.md                    ← THIS FILE (read first every session)
├── .env                        ← Environment variables (never commit)
├── .env.example                ← Template for env vars
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── prisma/
│   ├── schema.prisma           ← Database schema (source of truth)
│   └── migrations/             ← Database migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← Root layout with providers
│   │   ├── page.tsx            ← Landing / redirect to dashboard
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx      ← Dashboard layout with sidebar
│   │   │   ├── page.tsx        ← Main dashboard
│   │   │   ├── team/
│   │   │   │   ├── page.tsx    ── Team members list
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx    ── Projects list
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── time-tracker/
│   │   │   │   ├── page.tsx    ── Clock in/out interface
│   │   │   │   └── logs/page.tsx
│   │   │   ├── ai-assistant/
│   │   │   │   └── page.tsx    ── GLM chat interface
│   │   │   └── settings/
│   │   │       └── page.tsx    ── Superadmin settings
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── users/
│   │       │   ├── route.ts    ── GET all, POST create
│   │       │   └── [id]/route.ts
│   │       ├── projects/
│   │       │   ├── route.ts    ── GET all, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts ── GET, PUT, DELETE
│   │       │       └── members/route.ts
│   │       ├── time-logs/
│   │       │   ├── route.ts    ── GET all, POST clock-in
│   │       │   └── [id]/route.ts ── PUT clock-out
│   │       ├── ai/
│   │       │   └── chat/route.ts ── GLM chat endpoint
│   │       └── notifications/
│   │           └── route.ts    ── Send email/SMS
│   ├── components/
│   │   ├── ui/                 ← shadcn/ui components (auto-generated)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── dashboard/
│   │   │   ├── stats-cards.tsx
│   │   │   ├── recent-activity.tsx
│   │   │   └── project-overview.tsx
│   │   ├── team/
│   │   │   ├── member-card.tsx
│   │   │   ├── invite-modal.tsx
│   │   │   └── role-badge.tsx
│   │   ├── projects/
│   │   │   ├── project-card.tsx
│   │   │   ├── project-form.tsx
│   │   │   └── member-assignment.tsx
│   │   ├── time-tracker/
│   │   │   ├── clock-button.tsx
│   │   │   ├── active-session.tsx
│   │   │   └── time-log-table.tsx
│   │   ├── ai-assistant/
│   │   │   ├── chat-interface.tsx
│   │   │   ── message-bubble.tsx
│   │   │   └── project-context-selector.tsx
│   │   └── shared/
│   │       ├── data-table.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── loading-spinner.tsx
│   │       └── empty-state.tsx
│   ├── lib/
│   │   ├── db.ts               ← Prisma client singleton
│   │   ├── auth.ts              ← NextAuth config
│   │   ├── auth-options.ts      ← Auth options & callbacks
│   │   ├── utils.ts             ← General utilities
│   │   ├── validations/
│   │   │   ├── user.ts          ← Zod schemas for user
│   │   │   ├── project.ts      ← Zod schemas for project
│   │   │   └── time-log.ts     ← Zod schemas for time logs
│   │   └── constants.ts         ← App constants & enums
│   ├── hooks/
│   │   ├── use-current-user.ts
│   │   ├── use-time-tracker.ts
│   │   └── use-debounce.ts
│   ├── types/
│   │   └── index.ts            ← Shared TypeScript types
│   └── middleware.ts            ← Route protection & auth checks
├── docs/                        ← Project documentation
│   ├── architecture.md
│   ├── api-reference.md
│   ├── deployment-guide.md
│   ├── database-schema.md
│   └── contributing.md
└── public/
    └── images/
```

---

## 4. DATABASE SCHEMA (PRISMA)

### Source of truth: `prisma/schema.prisma`
### IMPORTANT: User model uses `password` field (not `passwordHash`). Auth is credentials-only (no Account/Session tables needed).
### Database connection: Uses `@prisma/adapter-libsql` for Turso (remote). Local SQLite for CLI operations.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum Role {
  SUPERADMIN
  ADMIN
  MEMBER
}

enum ProjectRole {
  LEAD
  MEMBER
}

enum ProjectStatus {
  ACTIVE
  COMPLETED
  ON_HOLD
  ARCHIVED
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  password     String
  role         Role     @default(MEMBER)
  avatar       String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  projectMembers ProjectMember[]
  timeLogs     TimeLog[]
  activityLogs ActivityLog[]
  aiChats      AiChat[]
}

model Project {
  id          String        @id @default(cuid())
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  members      ProjectMember[]
  timeLogs     TimeLog[]
  aiChats      AiChat[]
}

model ProjectMember {
  id        String      @id @default(cuid())
  projectId String
  userId    String
  role      ProjectRole @default(MEMBER)
  joinedAt  DateTime    @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
}

model TimeLog {
  id        String    @id @default(cuid())
  userId    String
  projectId String
  clockIn   DateTime  @default(now())
  clockOut  DateTime?
  duration  Int?      // seconds
  notes     String?
  createdAt DateTime  @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ActivityLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // LOGIN, LOGOUT, CLOCK_IN, CLOCK_OUT, PROJECT_CREATED, etc.
  details   String?
  timestamp DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Invitation {
  id        String      @id @default(cuid())
  email     String
  projectId String?
  role      Role        @default(MEMBER)
  token     String      @unique
  expiresAt DateTime
  accepted  Boolean     @default(false)
  createdAt DateTime    @default(now())

  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
}

model AiChat {
  id        String   @id @default(cuid())
  userId    String
  projectId String?
  role      String   // "user" or "assistant"
  content   String
  timestamp DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
}
```

---

## 5. ROLE-BASED ACCESS CONTROL (RBAC)

### Role Hierarchy:
```
SUPERADMIN (full access to everything)
  ├── Can manage all users (create, edit, deactivate, change roles)
  ├── Can manage all projects
  ├── Can view all time logs
  ├── Can access settings & system config
  ├── Can assign SUPERADMIN/ADMIN roles
  │
  ADMIN
  ├── Can create/edit projects
  ├── Can add/remove project members
  ├── Can assign LEAD/MEMBER roles on projects
  ├── Can view time logs for their projects
  ├── Can view team members
  ├── CANNOT manage users or change system settings
  │
  MEMBER
  ├── Can view assigned projects
  ├── Can clock in/out
  ├── Can view own time logs
  ├── Can use AI assistant
  ├── CANNOT manage projects or users
```

### Middleware Protection Rules:
- `/dashboard/*` — Requires authentication (all roles)
- `/dashboard/team/*` — Requires ADMIN or SUPERADMIN
- `/dashboard/settings` — Requires SUPERADMIN only
- `/api/users/*` — SUPERADMIN only (POST, PUT, DELETE)
- `/api/projects/*` — ADMIN+ for write, all authenticated for read
- `/api/time-logs/*` — Members can only access their own logs

---

## 6. CODING CONVENTIONS (STRICT)

### File Naming:
- Components: `kebab-case.tsx` (e.g., `clock-button.tsx`)
- Utilities: `kebab-case.ts` (e.g., `auth-options.ts`)
- API Routes: `route.ts` (Next.js convention)
- Types: `index.ts` in `types/` directory
- CSS: Use Tailwind only. No separate CSS files unless absolutely necessary.

### Code Style:
- Always use TypeScript strict mode
- Use `const` over `let`, never use `var`
- Prefer named exports over default exports (except pages)
- Use early returns to reduce nesting
- Destructure props and function parameters
- Use template literals for strings
- No `any` types — use proper TypeScript types or `unknown`
- Use Zod for all input validation (forms, API inputs)
- Use Prisma transactions for multi-step database operations

### Component Rules:
- Always use `"use client"` directive when using hooks, event handlers, or browser APIs
- Keep components small and focused (single responsibility)
- Extract reusable logic into custom hooks
- Use proper loading and error states for all data fetching
- Use `loading.tsx` files for route-level loading states
- Use `error.tsx` files for route-level error boundaries

### API Rules:
- Always validate input with Zod schemas
- Always check authentication and authorization
- Return proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Use `try/catch` for all async operations
- Return consistent JSON response format:
  ```json
  { "success": true, "data": {...}, "message": "..." }
  { "success": false, "error": "..." }
  ```

### Git Commit Messages:
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`
- Examples:
  - `feat: add team member invitation system`
  - `fix: resolve clock-in duplicate session bug`
  - `chore: update prisma schema`

### Import Order:
1. React / Next.js imports
2. Third-party libraries
3. shadcn/ui components
4. Local components
5. Local utilities/hooks
6. Types

---

## 7. AI ASSISTANT (GLM INTEGRATION) PROTOCOLS

### How GLM is integrated:
- GLM is accessed via `z-ai-web-dev-sdk` on the SERVER SIDE only (API routes)
- Never expose AI keys or SDK calls on the client side
- Chat endpoint: `POST /api/ai/chat`

### GLM Capabilities in This Project:
1. **Project Q&A** — Answer questions about project context
2. **Code Generation** — Generate code snippets, components, configs
3. **PRD/Documentation** — Draft project requirements, documentation
4. **Git Operations** — (Future) Create commits, branches via API
5. **Deployment** — (Future) Trigger Vercel deployments via API

### System Prompt for GLM:
When initializing GLM chat, always include project context:
- Current project name, description, tech stack
- Assigned team members
- Recent time logs and activity

### Chat Protocol:
```typescript
// Client sends:
{
  "message": "user message",
  "projectId": "optional-project-id",
  "conversationHistory": [...previousMessages]
}

// Server responds with GLM response and saves to AiChat table
```

---

## 8. ENVIRONMENT VARIABLES

### Required:
```env
# Database (Turso SQLite)
DATABASE_URL="file:./dev.db"           # Local dev
TURSO_DATABASE_URL="libsql://..."      # Production
TURSO_AUTH_TOKEN="..."                  # Production

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-secret-here"

# Email (Resend)
RESEND_API_KEY="re_..."

# SMS (Twilio - optional)
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="+1..."

# AI (z-ai-web-dev-sdk - built-in, no key needed)
```

### NEVER commit `.env` to git. Always use `.env.example` for documentation.

---

## 9. NOTIFICATION RULES

### Email Events (via Resend):
| Event | Trigger | Recipients |
|-------|---------|-----------|
| Welcome | New user registered | New user |
| Team Invite | User invited to project | Invitee |
| Project Assignment | Assigned as lead/member | Assigned user |
| Daily Summary | Every day at 9 AM (cron) | All active users |
| Inactivity Alert | No clock-in by 10 AM | SUPERADMIN |

### SMS Events (via Twilio — optional):
| Event | Trigger | Recipients |
|-------|---------|-----------|
| Urgent Alert | System down, critical issue | SUPERADMIN |

---

## 10. BUILD & DEPLOY PROTOCOLS

### Development:
```bash
npm run dev          # Start dev server on port 3000
npx prisma studio   # Open database GUI (local SQLite only)
npx prisma db push  # Push schema changes to local SQLite
bun run scripts/sync-turso.ts  # Sync schema to Turso remote database
bun run prisma/seed.ts  # Seed superadmin to Turso
```

### Production Build:
```bash
npm run build        # Build for production
npm run start        # Start production server
```

### Database Architecture:
- **Local (CLI)**: SQLite file at `file:./db/custom.db` for Prisma CLI operations
- **Remote (Runtime)**: Turso via `@prisma/adapter-libsql` for app runtime
- **Schema sync**: Use `scripts/sync-turso.ts` to push schema SQL to Turso
- **IMPORTANT**: Prisma CLI does NOT support Turso directly. Use local SQLite for schema management.

### Deployment (Vercel):
- Connected to GitHub: `https://github.com/KiranPradhan82/karma_board`
- Auto-deploy on push to `main` branch
- Environment variables set in Vercel dashboard
- Turso database URL and token configured in Vercel env vars

### Database Migrations:
- Run `npx prisma db push` locally to sync local schema
- Run `bun run scripts/sync-turso.ts` to push schema to Turso
- For production Vercel builds: Turso env vars handle runtime connection

---

## 11. GLM AGENT MODE PROTOCOLS (FUTURE)

### How GLM will interact with the project:
1. **Git Access** — GLM can read/commit via GitHub API (needs GITHUB_TOKEN)
2. **Vercel Deploy** — GLM can trigger deployments via Vercel API (needs VERCEL_TOKEN)
3. **Project Modification** — GLM can create/edit files via GitHub API

### Required Additional Tokens (for agent mode):
```env
GITHUB_TOKEN="ghp_..."           # GitHub Personal Access Token
VERCEL_TOKEN="..."               # Vercel API Token
VERCEL_PROJECT_ID="..."          # Vercel Project ID
```

---

## 12. TESTING REQUIREMENTS

### Testing Stack (to be added):
- Unit tests: Vitest
- Component tests: React Testing Library
- E2E tests: Playwright

### Test Coverage:
- All API routes must have tests
- All utility functions must have tests
- Critical user flows must have E2E tests

---

## 13. SECURITY RULES

- Passwords hashed with bcrypt (via NextAuth adapter)
- JWT sessions with secure cookies
- CSRF protection via NextAuth
- Rate limiting on auth endpoints
- Input sanitization via Zod
- SQL injection prevention via Prisma parameterized queries
- No sensitive data in client-side code
- Environment variables server-side only

---

## 14. USER PREFERENCES & WORKFLOW

### The user (superadmin) prefers:
- Clean, minimal UI design
- Dark mode support (add later)
- Professional color scheme (blues and neutrals)
- Responsive design — mobile-first approach
- Fast page loads — optimize with loading states
- No unnecessary animations or decorative elements
- Functional over fancy — every UI element must serve a purpose

### Communication:
- User speaks English
- Respond concisely — no fluff
- Show progress with clear milestones
- Proactively flag blockers or decisions needed

### Documentation:
- Keep docs in `/docs/` directory
- Update docs when schema or features change
- Use Markdown format for all documentation

---

## 15. CURRENT PROJECT STATUS

### Phase: Phase 1 Complete — Moving to Phase 2
### GitHub Repo: https://github.com/KiranPradhan82/karma_board

### Completed:
- [x] Requirements gathered
- [x] Tech stack decided
- [x] Database schema designed
- [x] Project structure defined
- [x] AGENT.md created
- [x] Next.js project scaffolded (App Router, TypeScript, Tailwind 4)
- [x] shadcn/ui components installed (30+ components)
- [x] Prisma schema created and synced to Turso
- [x] @prisma/adapter-libsql configured for Turso runtime
- [x] NextAuth.js v4 credentials provider configured
- [x] Login page (`/login`) — email/password sign in
- [x] Register page (`/register`) — new account creation
- [x] Dashboard layout with collapsible sidebar (desktop + mobile)
- [x] Dashboard page with stats cards (placeholder)
- [x] Middleware route protection (auth, RBAC)
- [x] Superadmin seeded to Turso (admin@teamforge.com / Admin@123)
- [x] Zod validations for user, project, time-log
- [x] TypeScript types defined
- [x] .env.example created
- [x] Project docs moved to /docs/ in project root
- [x] GitHub connected, code pushed to main
- [x] Build passes cleanly

### In Progress (Phase 2):
- [ ] Dashboard with real data (stats from DB)
- [ ] User management (CRUD for SUPERADMIN)
- [ ] Team management pages

### Pending:
- [ ] Project management (CRUD, member assignment)
- [ ] Time tracking (clock in/out, logs)
- [ ] AI assistant (GLM chat)
- [ ] Notifications (Resend email)
- [ ] Vercel deployment

---

## 16. CHANGE LOG

| Date | Change | Author |
|------|--------|--------|
| 2026-06-01 | Initial AGENT.md created with full project spec | Super Z |
| 2026-06-01 | Phase 1 completed: Turso setup, auth, dashboard layout, GitHub push | Super Z |
