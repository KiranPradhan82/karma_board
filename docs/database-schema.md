# TeamForge PM — Database Schema Reference

## Entity Relationship Diagram

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│    User     │       │   Project    │       │ Invitation  │
├─────────────┤       ├──────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)      │       │ id (PK)     │
│ name        │       │ name         │       │ email       │
│ email (UQ)  │       │ description  │       │ projectId   │──┐
│ passwordHash│       │ status       │       │ role        │  │
│ role        │       │ createdAt    │       │ token (UQ)  │  │
│ avatar      │       │ updatedAt    │       │ expiresAt   │  │
│ isActive    │       └──────┬───────┘       │ accepted    │  │
│ createdAt   │              │               │ createdAt   │  │
│ updatedAt   │              │               └─────────────┘  │
└──────┬──────┘              │                                │
       │                     │                                │
       │ 1:N                 │ 1:N                            │
       │                     │                                │
┌──────┴──────────┐  ┌─────┴─────────────┐                 │
│ ProjectMember    │  │    TimeLog         │                 │
├──────────────────┤  ├────────────────────┤                 │
│ id (PK)          │  │ id (PK)            │                 │
│ projectId (FK)   │  │ userId (FK)        │                 │
│ userId (FK)      │  │ projectId (FK)     │                 │
│ role             │  │ clockIn            │                 │
│ joinedAt         │  │ clockOut           │                 │
└──────────────────┘  │ duration           │                 │
                      │ notes              │                 │
                      │ createdAt          │                 │
                      └────────────────────┘                 │
                                                             │
┌──────────────────┐  ┌────────────────────┐  ┌──────────────┘
│  ActivityLog     │  │     AiChat        │
├──────────────────┤  ├────────────────────┤
│ id (PK)          │  │ id (PK)            │
│ userId (FK)      │  │ userId (FK)        │
│ action           │  │ projectId (FK)     │
│ details          │  │ role               │
│ timestamp        │  │ content            │
└──────────────────┘  │ timestamp          │
                      └────────────────────┘

┌──────────────────┐  ┌──────────────────┐
│    Account       │  │     Session       │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)           │
│ userId (FK)      │  │ sessionToken (UQ) │
│ type             │  │ userId (FK)       │
│ provider         │  │ expires           │
│ providerAccountId│  └──────────────────┘
│ refresh_token    │
│ access_token     │
│ expires_at       │
│ token_type       │
│ scope            │
│ id_token         │
└──────────────────┘
```

## Table Details

### User
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| name | String | NOT NULL | Full name |
| email | String | UNIQUE, NOT NULL | Login email |
| passwordHash | String | NOT NULL | Bcrypt hashed password |
| role | Enum | NOT NULL, default: MEMBER | SUPERADMIN, ADMIN, MEMBER |
| avatar | String | nullable | Avatar URL |
| isActive | Boolean | default: true | Soft delete flag |
| createdAt | DateTime | auto | Account creation time |
| updatedAt | DateTime | auto | Last update time |

### Project
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| name | String | NOT NULL | Project name |
| description | String | nullable | Project description |
| status | Enum | default: ACTIVE | ACTIVE, COMPLETED, ON_HOLD, ARCHIVED |
| createdAt | DateTime | auto | Creation time |
| updatedAt | DateTime | auto | Last update time |

### ProjectMember (Join Table)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| projectId | String | FK → Project | Project reference |
| userId | String | FK → User | User reference |
| role | Enum | default: MEMBER | LEAD or MEMBER on this project |
| joinedAt | DateTime | auto | When user joined |
| **UNIQUE** | | (projectId, userId) | Prevents duplicate assignments |

### TimeLog
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| userId | String | FK → User | Who tracked time |
| projectId | String | FK → Project | Which project |
| clockIn | DateTime | auto | Session start time |
| clockOut | DateTime | nullable | Session end time (null = active) |
| duration | Int | nullable | Duration in seconds |
| notes | String | nullable | Work notes |
| createdAt | DateTime | auto | Record creation time |

### ActivityLog
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| userId | String | FK → User | Who performed action |
| action | String | NOT NULL | Action type (LOGIN, LOGOUT, etc.) |
| details | String | nullable | Additional context |
| timestamp | DateTime | auto | When action occurred |

### Invitation
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| email | String | NOT NULL | Invitee email |
| projectId | String | FK → Project, nullable | Optional project assignment |
| role | Enum | default: MEMBER | Role for invited user |
| token | String | UNIQUE | Invitation token |
| expiresAt | DateTime | NOT NULL | Expiration time |
| accepted | Boolean | default: false | Was invitation accepted |
| createdAt | DateTime | auto | When invitation was sent |

### AiChat
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, auto (cuid) | Unique identifier |
| userId | String | FK → User | Who sent message |
| projectId | String | FK → Project, nullable | Optional project context |
| role | String | NOT NULL | "user" or "assistant" |
| content | String | NOT NULL | Message content |
| timestamp | DateTime | auto | When message was sent |

## Enums

### Role (User Roles)
| Value | Description |
|-------|-------------|
| SUPERADMIN | Full system access, can manage everything |
| ADMIN | Can manage projects and view team, cannot manage users |
| MEMBER | Can track time and view assigned projects only |

### ProjectRole (Project-specific Roles)
| Value | Description |
|-------|-------------|
| LEAD | Project lead, can manage project members |
| MEMBER | Regular project member |

### ProjectStatus
| Value | Description |
|-------|-------------|
| ACTIVE | Currently active project |
| COMPLETED | Finished project |
| ON_HOLD | Paused project |
| ARCHIVED | Archived/hidden project |

## Indexes

Prisma auto-creates indexes for all `@id` and `@unique` fields. Additional recommended indexes:

```prisma
// Recommended for performance (add to schema when needed)
@@index([userId, clockIn])       // TimeLog: fast user time queries
@@index([projectId, status])    // Project: filter by status
@@index([email])                 // Invitation: fast lookup
@@index([userId, timestamp])    // ActivityLog: user activity queries
```
