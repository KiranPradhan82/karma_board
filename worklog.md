# KarmaBoard Clients Feature — Worklog

## Date: 2025-06-02

## Summary
Implemented a comprehensive Clients feature for KarmaBoard, including client database tables, authentication for clients, API routes, admin UI, client portal, email notifications, and middleware routing.

## Files Created

### Validation
- `src/lib/validations/client.ts` — Zod schemas for client CRUD, notifications, profile updates, and inline client creation

### Email Templates
- Updated `src/lib/email.ts` — Added `sendClientWelcomeEmail()` and `sendClientNotificationEmail()` functions

### API Routes
- `src/app/api/clients/route.ts` — GET (list), POST (create) clients
- `src/app/api/clients/[id]/route.ts` — GET (detail), PUT (update), DELETE (soft delete)
- `src/app/api/clients/[id]/notify/route.ts` — POST (send notification to client)
- `src/app/api/clients/me/route.ts` — GET (own profile), PUT (update own profile)
- `src/app/api/clients/me/activities/route.ts` — GET (client-visible activities)
- `src/app/api/clients/me/change-password/route.ts` — POST (first-time password change)

### UI Pages
- `src/app/dashboard/clients/page.tsx` — Full CRUD admin page for managing clients
- `src/app/client/login/page.tsx` — Client login page
- `src/app/client/portal/page.tsx` — Client portal dashboard
- `src/app/client/profile/page.tsx` — Client profile editing
- `src/app/client/change-password/page.tsx` — Client first-time password change

## Files Modified

### Database Schema
- `prisma/schema.prisma` — Added CLIENT to Role enum, Client model, ClientNotification model, clientId to Project

### Type Definitions
- `src/types/next-auth.d.ts` — Added `accountType` to JWT and Session interfaces

### Authentication
- `src/lib/auth.ts` — Added `findClientByEmail()`, updated `authorize()` to check both User and Client tables, added `accountType` to JWT/session callbacks

### Middleware
- `src/middleware.ts` — Added client routing: blocks `/dashboard/*` for clients, redirects to `/client/portal`; blocks `/client/*` for team users; public routes for `/client/login` and `/client/change-password`

### Project Updates
- `src/app/api/projects/route.ts` — Updated to accept `clientId` and `newClient` inline creation
- `src/app/api/projects/[id]/route.ts` — Updated to accept `clientId`, return linked client info
- `src/app/dashboard/projects/page.tsx` — Added client dropdown and "Create New Client" inline form in create dialog
- `src/lib/validations/project.ts` — Added `clientId` and `newClient` fields to create/update schemas

### Navigation & Infrastructure
- `src/lib/constants.ts` — Added "Clients" nav item for SUPERADMIN, imported Briefcase icon
- `src/app/dashboard/layout.tsx` — Added Briefcase icon, Clients to ICON_MAP
- `scripts/sync-turso.ts` — Added CREATE TABLE for Client and ClientNotification, ALTER TABLE for Project.clientId

## Build Result
**PASS** — Build completed successfully with no errors.

## Turso Migration SQL Commands

```sql
-- Create Client table
CREATE TABLE IF NOT EXISTS "Client" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "company" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Client_email_key" ON "Client"("email");

-- Create ClientNotification table
CREATE TABLE IF NOT EXISTS "ClientNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "sentBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientNotification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add clientId column to Project
ALTER TABLE "Project" ADD COLUMN "clientId" TEXT;
```

---

## Date: 2025-06-03

## Task: Fix internal server error on Client section + Add error display system

### Problem
- Visiting the Clients section showed "internal server error"
- No way to see technical error details for debugging

### Files Created
- `src/components/error-detail-dialog.tsx` — Reusable error popup with copy-to-clipboard
- `src/hooks/use-api-error.tsx` — Custom hook providing `showError()`, `clearError()`, and pre-connected `ErrorDetailDialog` element

### Files Modified
- `src/app/api/clients/route.ts` — GET/POST catch blocks now return detailed error messages
- `src/app/api/clients/[id]/route.ts` — GET/PUT/DELETE catch blocks now return detailed error messages
- `src/app/api/clients/[id]/notify/route.ts` — POST catch block now returns detailed error messages
- `src/app/api/clients/me/route.ts` — GET/PUT catch blocks now return detailed error messages
- `src/app/api/clients/me/activities/route.ts` — GET catch block now returns detailed error messages
- `src/app/api/clients/me/change-password/route.ts` — POST catch block now returns detailed error messages
- `src/app/dashboard/clients/page.tsx` — Added useApiError hook with error popup on all fetch/form operations
- `src/app/client/portal/page.tsx` — Added useApiError hook with error popup on data fetches
- `src/app/client/profile/page.tsx` — Added useApiError hook with error popup on profile load/save
- `src/app/client/login/page.tsx` — Added useApiError hook with error popup on login failure

### Build Result
**PASS** — Build completed successfully. Commit: 64cef4e
