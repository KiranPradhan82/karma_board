# KarmaBoard — Architecture Documentation

## 1. System Architecture Overview

KarmaBoard is a full-stack web application built with Next.js following the App Router architecture pattern. It uses a monolithic design with clear separation between server and client code, leveraging Next.js server components and API routes for all backend operations.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Login   │  │Dashboard │  │  Time Tracker UI  │  │
│  │  Page    │  │  Pages   │  │  (Clock In/Out)   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │             │                 │              │
│  ┌────┴─────────────┴─────────────────┴──────────┐  │
│  │         Next.js App Router (Client/Server)     │  │
│  │    Server Components + Client Components       │  │
│  └────────────────────┬──────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────┐
│           NEXT.JS SERVER (API Routes)                │
│                       │                               │
│  ┌────────────────────┼────────────────────────┐     │
│  │  ┌─────────┐  ┌────┴────┐  ┌──────────┐    │     │
│  │  │ Auth    │  │ Users   │  │ Projects │    │     │
│  │  │ Routes  │  │ Routes  │  │ Routes   │    │     │
│  │  └────┬────┘  └────┬────┘  └────┬─────┘    │     │
│  │       │            │            │           │     │
│  │  ┌────┴────┐  ┌────┴────┐  ┌───┴──────┐    │     │
│  │  │ TimeLog │  │   AI    │  │ Notif.   │    │     │
│  │  │ Routes  │  │  Chat   │  │ Routes   │    │     │
│  │  └─────────┘  └────┬────┘  └──────────┘    │     │
│  └─────────────────────┼───────────────────────┘     │
└────────────────────────┼────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────┴──────┐ ┌────┴─────┐ ┌──────┴──────┐
   │   Turso     │ │ Resend   │ │    GLM AI   │
   │  SQLite DB  │ │  Email   │ │  (z-ai-sdk) │
   │  (Prisma)   │ │  API     │ │             │
   └─────────────┘ └──────────┘ └─────────────┘
```

## 2. Data Flow

### Authentication Flow
```
User → Login Page → POST /api/auth/[...nextauth]
  → NextAuth validates credentials
  → Creates JWT session
  → Sets HTTP-only cookie
  → Redirects to /dashboard
```

### Time Tracking Flow
```
Member → Clock In → POST /api/time-logs
  → Validates user is authenticated
  → Checks for existing active session
  → Creates TimeLog record (clockIn = now, clockOut = null)
  → Creates ActivityLog entry
  → Returns success response

Member → Clock Out → PUT /api/time-logs/[id]
  → Finds active TimeLog by user
  → Sets clockOut = now
  → Calculates duration = clockOut - clockIn
  → Updates TimeLog record
  → Creates ActivityLog entry
  → Returns updated log with duration
```

### AI Chat Flow
```
User → Type message → POST /api/ai/chat
  → Validates user is authenticated
  → Saves user message to AiChat table
  → Builds system prompt with project context
  → Calls z-ai-web-dev-sdk for GLM response
  → Saves assistant response to AiChat table
  → Returns response to client
```

## 3. Prisma ORM Layer

Prisma acts as the single data access layer. All database operations MUST go through Prisma — never use raw SQL unless absolutely necessary and approved by the superadmin.

### Prisma Client Singleton Pattern
```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## 4. Authentication Architecture

### NextAuth v5 Configuration
- **Strategy**: Credentials (email/password)
- **Session**: JWT-based (stateless)
- **Callbacks**:
  - `jwt` — Inject user role and id into token
  - `session` — Expose user data to client
- **Adapter**: Custom (no OAuth for now)

### Middleware Protection
```typescript
// middleware.ts
export { default } from "next-auth/middleware"

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*'
  ]
}
```

## 5. API Design Principles

### RESTful Routes
| Method | Pattern | Description | Auth |
|--------|---------|-------------|------|
| POST | /api/auth/[...nextauth] | Authentication | Public |
| GET | /api/users | List all users | SUPERADMIN |
| POST | /api/users | Create user | SUPERADMIN |
| GET | /api/users/[id] | Get user details | SELF or ADMIN+ |
| PUT | /api/users/[id] | Update user | SELF or SUPERADMIN |
| GET | /api/projects | List projects | Authenticated |
| POST | /api/projects | Create project | ADMIN+ |
| PUT | /api/projects/[id] | Update project | ADMIN+ |
| DELETE | /api/projects/[id] | Delete project | SUPERADMIN |
| POST | /api/projects/[id]/members | Assign member | ADMIN+ |
| GET | /api/time-logs | List time logs | SELF or ADMIN+ |
| POST | /api/time-logs | Clock in | Authenticated |
| PUT | /api/time-logs/[id] | Clock out | Authenticated |
| POST | /api/ai/chat | Send AI message | Authenticated |

## 6. Error Handling Strategy

### API Error Response Format
```typescript
// All API routes return consistent error format
{
  "success": false,
  "error": "Human-readable error message"
}
```

### HTTP Status Codes
- 200 — Success (GET, PUT)
- 201 — Created (POST)
- 400 — Bad Request (validation error)
- 401 — Unauthorized (not logged in)
- 403 — Forbidden (insufficient permissions)
- 404 — Not Found
- 409 — Conflict (duplicate entry)
- 500 — Internal Server Error

## 7. Security Architecture

### Threat Model & Mitigations
| Threat | Mitigation |
|--------|-----------|
| SQL Injection | Prisma parameterized queries |
| XSS | React auto-escaping, CSP headers |
| CSRF | NextAuth CSRF tokens |
| Brute Force | Rate limiting (future: Upstash) |
| Session Hijacking | HTTP-only secure cookies |
| Data Exposure | RBAC on every API route |
| Password Leakage | bcrypt hashing, no plaintext storage |

## 8. Performance Considerations

- Server Components by default (reduce client JS bundle)
- Streaming with Suspense for slow data fetching
- Prisma query optimization (select only needed fields)
- Client-side caching with SWR or React Query (future)
- Image optimization via Next.js Image component
