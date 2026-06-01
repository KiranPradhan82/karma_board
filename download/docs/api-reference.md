# KarmaBoard — API Reference

## Base URL
- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication
All protected endpoints require a valid session cookie set by NextAuth. Include credentials in all requests.

---

## Endpoints

### Authentication

#### `POST /api/auth/[...nextauth]`
Handles all authentication operations.

**Sign In Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "ADMIN"
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

---

### Users

#### `GET /api/users`
List all users. **SUPERADMIN only.**

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| role | string | Filter by role (SUPERADMIN, ADMIN, MEMBER) |
| active | boolean | Filter by active status |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [...],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

#### `POST /api/users`
Create a new user. **SUPERADMIN only.**

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "SecurePass123!",
  "role": "MEMBER"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "MEMBER",
    "isActive": true,
    "createdAt": "2026-06-01T10:00:00Z"
  }
}
```

#### `PUT /api/users/[id]`
Update a user. **SELF or SUPERADMIN.**

**Request Body (partial update allowed):**
```json
{
  "name": "Jane Doe",
  "role": "ADMIN",
  "isActive": false
}
```

#### `DELETE /api/users/[id]`
Deactivate a user (soft delete). **SUPERADMIN only.**

**Response (200):**
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

---

### Projects

#### `GET /api/projects`
List all projects the user has access to. **Authenticated.**

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by status (ACTIVE, COMPLETED, ON_HOLD, ARCHIVED) |
| search | string | Search by project name |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "Website Redesign",
      "description": "Complete redesign of the company website",
      "status": "ACTIVE",
      "members": [
        { "userId": "clx...", "name": "John Doe", "role": "LEAD" }
      ],
      "createdAt": "2026-05-15T08:00:00Z"
    }
  ]
}
```

#### `POST /api/projects`
Create a new project. **ADMIN or SUPERADMIN.**

**Request Body:**
```json
{
  "name": "New Project",
  "description": "Project description here"
}
```

#### `PUT /api/projects/[id]`
Update project details. **ADMIN or SUPERADMIN (project member).**

**Request Body:**
```json
{
  "name": "Updated Project Name",
  "description": "Updated description",
  "status": "COMPLETED"
}
```

#### `DELETE /api/projects/[id]`
Delete a project. **SUPERADMIN only.**

#### `POST /api/projects/[id]/members`
Assign a member to a project. **ADMIN or SUPERADMIN.**

**Request Body:**
```json
{
  "userId": "clx...",
  "role": "LEAD"
}
```

#### `DELETE /api/projects/[id]/members`
Remove a member from a project. **ADMIN or SUPERADMIN.**

**Request Body:**
```json
{
  "userId": "clx..."
}
```

---

### Time Logs

#### `GET /api/time-logs`
List time logs. **Members see own logs; ADMIN+ see all.**

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| userId | string | Filter by user (ADMIN+ only) |
| projectId | string | Filter by project |
| from | string | Start date (ISO 8601) |
| to | string | End date (ISO 8601) |
| active | boolean | Show only active (unclocked) sessions |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "userId": "clx...",
      "userName": "John Doe",
      "projectId": "clx...",
      "projectName": "Website Redesign",
      "clockIn": "2026-06-01T09:00:00Z",
      "clockOut": "2026-06-01T17:30:00Z",
      "duration": 30600,
      "notes": "Completed landing page"
    }
  ]
}
```

#### `POST /api/time-logs`
Clock in to start a time session. **Authenticated members.**

**Request Body:**
```json
{
  "projectId": "clx...",
  "notes": "Starting work on homepage"
}
```

**Validation:**
- User must not have an active (unclocked) session
- Project must exist and user must be a member

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "clockIn": "2026-06-01T09:00:00Z",
    "clockOut": null,
    "duration": null
  }
}
```

#### `PUT /api/time-logs/[id]`
Clock out to end a time session. **Authenticated (own session only).**

**Request Body:**
```json
{
  "notes": "Finished homepage design"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "clockIn": "2026-06-01T09:00:00Z",
    "clockOut": "2026-06-01T17:30:00Z",
    "duration": 30600
  }
}
```

---

### AI Chat

#### `POST /api/ai/chat`
Send a message to the GLM AI assistant. **Authenticated.**

**Request Body:**
```json
{
  "message": "How should I structure the authentication flow?",
  "projectId": "clx...",
  "conversationHistory": [
    { "role": "user", "content": "I need help with auth" },
    { "role": "assistant", "content": "I can help with that..." }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Here's how you should structure the auth flow...",
    "timestamp": "2026-06-01T10:30:00Z"
  }
}
```

---

### Notifications

#### `POST /api/notifications`
Send a notification. **ADMIN or SUPERADMIN.**

**Request Body:**
```json
{
  "type": "EMAIL",
  "to": "user@example.com",
  "subject": "Project Assignment",
  "body": "You have been assigned to the Website Redesign project."
}
```

---

## Error Codes Reference

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource created |
| 400 | Invalid request body or parameters |
| 401 | Not authenticated |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Duplicate resource (e.g., duplicate email) |
| 429 | Rate limited (too many requests) |
| 500 | Internal server error |
