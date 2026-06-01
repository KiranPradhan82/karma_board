import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, Image
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import hashlib

# ━━ Font Registration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif-Bold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSans', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif-Bold')
registerFontFamily('LiberationSans', normal='LiberationSans', bold='LiberationSans')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ━━ Color Palette (auto-generated) ━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCENT       = colors.HexColor('#197999')
TEXT_PRIMARY  = colors.HexColor('#1c1d1f')
TEXT_MUTED    = colors.HexColor('#6f747a')
BG_SURFACE   = colors.HexColor('#e0e3e8')
BG_PAGE      = colors.HexColor('#eff0f1')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ━━ Styles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    name='DocTitle', fontName='LiberationSerif', fontSize=28,
    leading=36, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    spaceAfter=6
)

h1_style = ParagraphStyle(
    name='H1', fontName='LiberationSerif', fontSize=20,
    leading=28, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    spaceBefore=18, spaceAfter=10
)

h2_style = ParagraphStyle(
    name='H2', fontName='LiberationSerif', fontSize=15,
    leading=22, alignment=TA_LEFT, textColor=ACCENT,
    spaceBefore=14, spaceAfter=8
)

h3_style = ParagraphStyle(
    name='H3', fontName='LiberationSerif', fontSize=12,
    leading=18, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    spaceBefore=10, spaceAfter=6
)

body_style = ParagraphStyle(
    name='Body', fontName='LiberationSerif', fontSize=10.5,
    leading=17, alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
    spaceAfter=6
)

code_style = ParagraphStyle(
    name='Code', fontName='DejaVuSans', fontSize=9,
    leading=14, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    backColor=BG_PAGE, leftIndent=12, rightIndent=12,
    spaceBefore=4, spaceAfter=4,
    borderPadding=(6, 6, 6, 6)
)

bullet_style = ParagraphStyle(
    name='Bullet', fontName='LiberationSerif', fontSize=10.5,
    leading=17, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    leftIndent=20, bulletIndent=8, spaceAfter=4
)

caption_style = ParagraphStyle(
    name='Caption', fontName='LiberationSerif', fontSize=9,
    leading=13, alignment=TA_CENTER, textColor=TEXT_MUTED,
    spaceBefore=3, spaceAfter=6
)

header_cell_style = ParagraphStyle(
    name='HeaderCell', fontName='LiberationSerif', fontSize=10,
    leading=14, alignment=TA_CENTER, textColor=colors.white
)

cell_style = ParagraphStyle(
    name='Cell', fontName='LiberationSerif', fontSize=9.5,
    leading=14, alignment=TA_CENTER, textColor=TEXT_PRIMARY
)

cell_left_style = ParagraphStyle(
    name='CellLeft', fontName='LiberationSerif', fontSize=9.5,
    leading=14, alignment=TA_LEFT, textColor=TEXT_PRIMARY
)

# ━━ TOC DocTemplate ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

page_width = A4[0]
left_margin = 1.0 * inch
right_margin = 1.0 * inch
available_width = page_width - left_margin - right_margin

doc = TocDocTemplate(
    '/home/z/my-project/download/TeamForge_PM_Project_Documentation.pdf',
    pagesize=A4,
    leftMargin=left_margin,
    rightMargin=right_margin,
    topMargin=0.8 * inch,
    bottomMargin=0.8 * inch,
)

story = []

# ━━ TOC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name='TOC1', fontName='LiberationSerif', fontSize=13, leftIndent=20, leading=20, spaceBefore=6, spaceAfter=3),
    ParagraphStyle(name='TOC2', fontName='LiberationSerif', fontSize=11, leftIndent=40, leading=18, spaceBefore=3, spaceAfter=2),
]
story.append(Paragraph('<b>Table of Contents</b>', title_style))
story.append(Spacer(1, 12))
story.append(toc)
story.append(PageBreak())

# ━━ Helper Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def make_table(headers, rows, col_ratios=None):
    if col_ratios is None:
        col_ratios = [1.0 / len(headers)] * len(headers)
    col_widths = [r * available_width for r in col_ratios]
    data = [[Paragraph('<b>%s</b>' % h, header_cell_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), cell_style) for c in row])
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ═══════════════════════════════════════════════════════════════
# SECTION 1: PROJECT OVERVIEW
# ═══════════════════════════════════════════════════════════════
story.append(heading('1. Project Overview', h1_style, 0))

story.append(Paragraph(
    'TeamForge PM is a full-stack project management web application designed to help teams '
    'collaborate efficiently. It provides a comprehensive suite of tools for managing team '
    'members, tracking project progress, monitoring work hours through a built-in time tracking '
    'system, and leveraging artificial intelligence for project development assistance. The platform '
    'is built with a modern technology stack centered around Next.js, TypeScript, and Turso SQLite, '
    'ensuring high performance, reliability, and scalability for teams of all sizes.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'The application follows a clear role-based access control model with three distinct roles: '
    'Superadmin, Admin, and Member. The Superadmin has unrestricted access to the entire system and '
    'can manage users, projects, and system configuration. Admins can create and manage projects, '
    'assign team members, and review time logs. Members can clock in and out of work sessions, '
    'view their assigned projects, and interact with the AI assistant. This hierarchy ensures '
    'proper separation of concerns while maintaining operational flexibility.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'One of the standout features of TeamForge PM is its integration with GLM (the AI model) via '
    'the z-ai-web-dev-sdk. This integration allows team members to chat with an AI assistant that '
    'has full context about their projects, helping with code generation, documentation drafting, '
    'problem-solving, and more. In the future, the AI agent mode will enable GLM to directly access '
    'Git repositories and deploy changes through Vercel, creating an end-to-end automated development '
    'workflow right from the project management interface.',
    body_style
))

story.append(Spacer(1, 12))
story.append(heading('1.1 Key Features', h2_style, 1))

features = [
    ['Authentication', 'Secure email/password login with JWT sessions via NextAuth.js v5'],
    ['Role-Based Access', 'Three-tier permission system (Superadmin, Admin, Member)'],
    ['Dashboard', 'Real-time overview of projects, team activity, and key metrics'],
    ['User Management', 'Add, edit, and deactivate team members with role assignment'],
    ['Project Management', 'Create, organize, and track projects with status management'],
    ['Team Assignment', 'Assign leads and members to projects with project-specific roles'],
    ['Time Tracking', 'Clock in/out with duration calculation and project selection'],
    ['AI Assistant', 'GLM-powered chat interface for project help and code generation'],
    ['Notifications', 'Email alerts via Resend for invitations, assignments, and summaries'],
    ['Audit Logging', 'Complete activity trail for login, logout, and system actions'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Feature', 'Description'], features, [0.28, 0.72]))
story.append(Paragraph('Table 1: Core features of TeamForge PM', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 2: TECHNOLOGY STACK
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('2. Technology Stack', h1_style, 0))

story.append(Paragraph(
    'The technology stack for TeamForge PM has been carefully selected to balance developer '
    'experience, performance, scalability, and maintainability. Each technology serves a specific '
    'purpose in the architecture, and together they form a cohesive ecosystem that supports the '
    'full development lifecycle from local development to production deployment. The stack is locked, '
    'meaning no new dependencies will be introduced without explicit approval from the project '
    'superadmin, ensuring consistency and reducing the risk of dependency conflicts.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('2.1 Core Technologies', h2_style, 1))

tech_rows = [
    ['Next.js 16', 'Framework', 'Full-stack React framework with App Router and server components'],
    ['TypeScript', 'Language', 'Strict mode for type safety across the entire codebase'],
    ['Turso SQLite', 'Database', 'Edge-friendly libSQL database with Prisma ORM'],
    ['Prisma', 'ORM', 'Type-safe database access with migrations and schema management'],
    ['NextAuth.js v5', 'Auth', 'JWT-based authentication with credentials provider'],
    ['Tailwind CSS 4', 'Styling', 'Utility-first CSS framework for rapid UI development'],
    ['shadcn/ui', 'UI Library', 'Pre-built accessible React components with Tailwind'],
    ['Resend', 'Email', 'Transactional email API for notifications and alerts'],
    ['Twilio', 'SMS', 'Optional SMS notifications for urgent alerts'],
    ['z-ai-web-dev-sdk', 'AI', 'GLM AI integration for chat and code generation'],
    ['Vercel', 'Deployment', 'Automatic deployments from GitHub with edge hosting'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Technology', 'Category', 'Purpose'], tech_rows, [0.18, 0.12, 0.70]))
story.append(Paragraph('Table 2: Core technology stack', caption_style))

story.append(Spacer(1, 10))
story.append(heading('2.2 Supporting Libraries', h2_style, 1))

story.append(Paragraph(
    'In addition to the core technologies, the project utilizes several supporting libraries that '
    'enhance developer productivity and user experience. Zod provides runtime schema validation for '
    'all API inputs and form submissions, ensuring data integrity at every entry point. React Hook Form '
    'pairs with Zod to provide a performant form handling solution with minimal re-renders. The date-fns '
    'library offers a comprehensive set of date manipulation utilities for formatting timestamps, '
    'calculating durations, and displaying relative times in the time tracking module.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'For data visualization on the dashboard, Recharts provides a composable charting library built on '
    'React components, enabling interactive charts for time tracking analytics, project progress, and '
    'team activity metrics. Lucide React supplies a consistent icon set that integrates seamlessly with '
    'the design system. Sonner handles toast notifications for user feedback on actions like saving '
    'changes, creating projects, or clocking in. For production environments, additional tools like '
    'Upstash Redis for rate limiting and Sentry for error tracking are recommended.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# SECTION 3: DATABASE SCHEMA
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('3. Database Schema', h1_style, 0))

story.append(Paragraph(
    'The database schema is designed around a relational model with nine core tables that capture '
    'all aspects of team management, project organization, time tracking, and AI interactions. Prisma '
    'serves as the sole data access layer, meaning all database operations must go through Prisma '
    'queries rather than raw SQL, ensuring type safety and consistent query patterns across the '
    'application. The schema uses cuid for primary key generation, providing globally unique identifiers '
    'without requiring database-level auto-increment configuration.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('3.1 Entity Overview', h2_style, 1))

entity_rows = [
    ['User', 'Core user accounts with roles, profile info, and active status'],
    ['Account', 'NextAuth OAuth account linking (reserved for future OAuth support)'],
    ['Session', 'NextAuth session management for JWT-based authentication'],
    ['Project', 'Project records with name, description, and status tracking'],
    ['ProjectMember', 'Join table linking users to projects with project-specific roles'],
    ['TimeLog', 'Time tracking entries with clock-in, clock-out, and duration'],
    ['ActivityLog', 'Audit trail recording all user actions with timestamps'],
    ['Invitation', 'Email invitation tokens for onboarding new team members'],
    ['AiChat', 'Persistent AI conversation history linked to users and projects'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Entity', 'Description'], entity_rows, [0.20, 0.80]))
story.append(Paragraph('Table 3: Database entities', caption_style))

story.append(Spacer(1, 10))
story.append(heading('3.2 Role-Based Access Control', h2_style, 1))

story.append(Paragraph(
    'The role system defines three levels of access control that determine what each user can see '
    'and do within the application. The Superadmin role grants unrestricted access to all system '
    'features, including user management, project creation, system settings, and the ability to '
    'promote other users to Admin or Superadmin status. This role is intended for the project owner '
    'or primary system administrator who needs full visibility and control over the platform.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'The Admin role provides elevated privileges focused on project and team management. Admins can '
    'create and modify projects, assign team members as leads or regular members, and view time logs '
    'for all users within their managed projects. However, Admins cannot modify user accounts, change '
    'system settings, or alter role assignments at the global level. The Member role is the most '
    'restricted, allowing users to view their assigned projects, clock in and out of work sessions, '
    'access their own time logs, and interact with the AI assistant. This ensures that sensitive '
    'administrative functions remain protected while still giving team members the tools they need '
    'to be productive.',
    body_style
))

rbac_rows = [
    ['Superadmin', 'Full system access', 'Manage users, projects, settings, roles'],
    ['Admin', 'Project management', 'Create projects, assign members, view time logs'],
    ['Member', 'Self-service', 'Clock in/out, view own projects, use AI assistant'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Role', 'Scope', 'Capabilities'], rbac_rows, [0.15, 0.25, 0.60]))
story.append(Paragraph('Table 4: Role-based access control hierarchy', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 4: PROJECT STRUCTURE
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('4. Project Structure', h1_style, 0))

story.append(Paragraph(
    'The project follows a well-organized directory structure that separates concerns across '
    'multiple layers of the application. The Next.js App Router structure uses route groups '
    'to organize pages by functionality, with a dedicated (auth) group for authentication pages '
    'and a (dashboard) group for all protected application pages. This approach enables shared '
    'layouts within each group while keeping the URL structure clean and intuitive. API routes '
    'follow RESTful conventions, with each resource having its own directory containing a route.ts '
    'handler for the standard HTTP methods.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('4.1 Directory Layout', h2_style, 1))

story.append(Paragraph(
    'The source code lives under the src/ directory and is divided into four main subdirectories: '
    'app/, components/, lib/, and hooks/. The app/ directory contains all Next.js routes including '
    'pages, layouts, and API endpoints. Components are organized by feature domain (dashboard, team, '
    'projects, time-tracker, ai-assistant) with shared components in the shared/ subdirectory and '
    'auto-generated shadcn/ui components in the ui/ subdirectory. The lib/ directory houses '
    'configuration files, utility functions, Zod validation schemas, and the Prisma client singleton. '
    'Custom React hooks for reusable stateful logic reside in the hooks/ directory.',
    body_style
))

story.append(Spacer(1, 6))

dir_rows = [
    ['src/app/', 'Next.js App Router pages, layouts, and API routes'],
    ['src/components/ui/', 'shadcn/ui auto-generated components'],
    ['src/components/dashboard/', 'Dashboard-specific widgets and cards'],
    ['src/components/team/', 'Team member management components'],
    ['src/components/projects/', 'Project CRUD and assignment components'],
    ['src/components/time-tracker/', 'Clock in/out interface components'],
    ['src/components/ai-assistant/', 'GLM chat interface components'],
    ['src/components/shared/', 'Reusable components (tables, dialogs, loaders)'],
    ['src/lib/', 'Database client, auth config, utilities, validations'],
    ['src/hooks/', 'Custom React hooks (useCurrentUser, useTimeTracker)'],
    ['src/types/', 'Shared TypeScript type definitions'],
    ['prisma/', 'Prisma schema, migrations, and seed scripts'],
    ['docs/', 'Project documentation (architecture, API, deployment)'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Directory', 'Purpose'], dir_rows, [0.30, 0.70]))
story.append(Paragraph('Table 5: Key directories and their purposes', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 5: API DESIGN
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('5. API Design', h1_style, 0))

story.append(Paragraph(
    'The API follows RESTful conventions with a consistent design pattern across all endpoints. Every '
    'protected endpoint requires a valid session cookie set by NextAuth, and authorization checks are '
    'performed at the route level before any database operations occur. All API responses follow a '
    'standardized JSON format with a success boolean, data payload (for successful responses), and an '
    'error message (for failures). Input validation is handled exclusively through Zod schemas, which '
    'are defined in the lib/validations/ directory and reused across both client and server code.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('5.1 API Endpoints', h2_style, 1))

api_rows = [
    ['POST', '/api/auth/[...nextauth]', 'Authentication (login/register)', 'Public'],
    ['GET', '/api/users', 'List all users', 'Superadmin'],
    ['POST', '/api/users', 'Create new user', 'Superadmin'],
    ['PUT', '/api/users/[id]', 'Update user', 'Self / Superadmin'],
    ['GET', '/api/projects', 'List projects', 'Authenticated'],
    ['POST', '/api/projects', 'Create project', 'Admin+'],
    ['PUT', '/api/projects/[id]', 'Update project', 'Admin+'],
    ['DELETE', '/api/projects/[id]', 'Delete project', 'Superadmin'],
    ['POST', '/api/projects/[id]/members', 'Assign member to project', 'Admin+'],
    ['GET', '/api/time-logs', 'List time logs', 'Self / Admin+'],
    ['POST', '/api/time-logs', 'Clock in (start session)', 'Authenticated'],
    ['PUT', '/api/time-logs/[id]', 'Clock out (end session)', 'Authenticated'],
    ['POST', '/api/ai/chat', 'Send message to GLM', 'Authenticated'],
    ['POST', '/api/notifications', 'Send notification', 'Admin+'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Method', 'Endpoint', 'Description', 'Auth'], api_rows, [0.08, 0.28, 0.36, 0.28]))
story.append(Paragraph('Table 6: Complete API endpoint reference', caption_style))

story.append(Spacer(1, 10))
story.append(heading('5.2 Response Format', h2_style, 1))

story.append(Paragraph(
    'All API endpoints return responses in a consistent JSON format to simplify error handling on the '
    'client side. Successful responses include a "success" field set to true along with the requested '
    'data payload and an optional message. Error responses set "success" to false and include a '
    'human-readable error message that can be displayed to the user. The API uses standard HTTP status '
    'codes to indicate the nature of the response: 200 for successful reads, 201 for resource creation, '
    '400 for validation errors, 401 for missing authentication, 403 for insufficient permissions, '
    '404 for missing resources, 409 for duplicate entries, and 500 for server-side errors.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# SECTION 6: AI ASSISTANT (GLM)
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('6. AI Assistant Integration', h1_style, 0))

story.append(Paragraph(
    'The AI assistant is powered by GLM and accessed exclusively through server-side API routes using '
    'the z-ai-web-dev-sdk. This architecture ensures that API keys and SDK configuration remain '
    'secure on the server, with only the chat messages being transmitted between the client and '
    'the server. The chat interface allows users to ask questions about their projects, request code '
    'generation, draft documentation, and get AI-powered suggestions for development tasks.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('6.1 Chat Protocol', h2_style, 1))

story.append(Paragraph(
    'When a user sends a message, the client POSTs to /api/ai/chat with the message content, '
    'an optional project ID for context, and the full conversation history for maintaining context. '
    'The server saves the user message to the AiChat table, constructs a system prompt that includes '
    'project context (project name, description, assigned team members, and recent activity), and then '
    'invokes the GLM model through the z-ai-web-dev-sdk. The assistant response is saved to the '
    'AiChat table and returned to the client for display in the chat interface.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('6.2 Future: Agent Mode', h2_style, 1))

story.append(Paragraph(
    'The planned agent mode will extend the AI assistant capabilities significantly. With access to '
    'a GitHub Personal Access Token and Vercel API credentials, GLM will be able to read the project '
    'repository, create new branches, commit code changes, and trigger deployments directly from the '
    'chat interface. This creates an end-to-end development workflow where a team member can describe '
    'a feature, have GLM generate and commit the code, and deploy it to production, all from within '
    'the TeamForge PM interface. The required environment variables for agent mode are GITHUB_TOKEN, '
    'VERCEL_TOKEN, and VERCEL_PROJECT_ID.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# SECTION 7: TIME TRACKING
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('7. Time Tracking System', h1_style, 0))

story.append(Paragraph(
    'The time tracking system is a core feature of TeamForge PM that enables accurate recording of '
    'work hours for every team member. It operates on a simple clock-in/clock-out model where members '
    'start a work session by selecting a project and clicking "Clock In," which creates a TimeLog '
    'record with the current timestamp as the clockIn value and a null clockOut. When the member '
    'finishes work, they click "Clock Out," which sets the clockOut timestamp and automatically '
    'calculates the duration in seconds. The system prevents duplicate active sessions by validating '
    'that no existing TimeLog with a null clockOut exists for the user.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('7.1 Clock In/Out Flow', h2_style, 1))

story.append(Paragraph(
    'The clock-in process begins with the member selecting a project from their assigned projects '
    'list, optionally adding a note describing the work they plan to do. The POST request to '
    '/api/time-logs triggers server-side validation that checks authentication, verifies the user '
    'has no active session, and confirms the user is a member of the selected project. If all '
    'validations pass, a new TimeLog record is created and an ActivityLog entry is generated to '
    'audit the clock-in event. The clock-out process mirrors this flow, finding the active session, '
    'updating it with the current timestamp, computing the duration, and logging the event.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('7.2 Time Log Analytics', h2_style, 1))

story.append(Paragraph(
    'Time log data feeds into the dashboard analytics module, where Recharts renders visualizations '
    'of work patterns across the team. Admins and Superadmins can view aggregate time reports filtered '
    'by date range, project, or team member. The analytics include total hours worked per day, weekly '
    'trends, project distribution of work hours, and comparisons across team members. These insights '
    'help management identify workload imbalances, track project progress, and make informed decisions '
    'about resource allocation.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# SECTION 8: NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('8. Notification System', h1_style, 0))

story.append(Paragraph(
    'The notification system uses Resend as the primary email delivery service and optionally '
    'Twilio for SMS notifications. Notifications are triggered by specific system events and sent '
    'to the appropriate recipients based on the event type. The system supports both immediate '
    'notifications for time-sensitive events and scheduled notifications for recurring summaries. '
    'All notification templates are managed server-side, ensuring consistent branding and formatting '
    'across all emails sent from the platform.',
    body_style
))

notif_rows = [
    ['Welcome Email', 'New user registered', 'New user', 'Immediate'],
    ['Team Invitation', 'User invited to project', 'Invitee', 'Immediate'],
    ['Project Assignment', 'Assigned as lead/member', 'Assigned user', 'Immediate'],
    ['Daily Summary', 'Every day at 9 AM', 'All active users', 'Scheduled (cron)'],
    ['Inactivity Alert', 'No clock-in by 10 AM', 'Superadmin', 'Scheduled (cron)'],
    ['Urgent Alert', 'System down / critical issue', 'Superadmin', 'Immediate (SMS)'],
]
story.append(Spacer(1, 10))
story.append(make_table(['Event', 'Trigger', 'Recipients', 'Timing'], notif_rows, [0.18, 0.28, 0.28, 0.26]))
story.append(Paragraph('Table 7: Notification event matrix', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 9: SECURITY
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('9. Security Architecture', h1_style, 0))

story.append(Paragraph(
    'Security is a foundational concern in TeamForge PM, and multiple layers of protection are '
    'implemented throughout the application stack. Passwords are hashed using bcrypt through the '
    'NextAuth credentials adapter, ensuring that plaintext passwords are never stored in the database. '
    'Session management uses HTTP-only secure cookies with JWT tokens, preventing session hijacking '
    'through XSS attacks. CSRF protection is handled automatically by NextAuth, and all API inputs '
    'are validated through Zod schemas before processing, providing defense against injection attacks '
    'and malformed data.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'The Prisma ORM provides an additional layer of protection against SQL injection through its '
    'parameterized query builder, which ensures that user input is never interpolated directly into '
    'SQL statements. The middleware layer enforces route protection, ensuring that unauthenticated '
    'users cannot access dashboard pages or protected API endpoints. Role-based authorization checks '
    'at the API level prevent privilege escalation, where a regular member might attempt to access '
    'admin-only functionality by directly calling an API endpoint. For production environments, rate '
    'limiting via Upstash Redis is recommended to protect against brute-force attacks on authentication '
    'endpoints.',
    body_style
))

security_rows = [
    ['SQL Injection', 'Prisma parameterized queries'],
    ['XSS Attacks', 'React auto-escaping and CSP headers'],
    ['CSRF Attacks', 'NextAuth built-in CSRF tokens'],
    ['Session Hijacking', 'HTTP-only secure cookies with JWT'],
    ['Brute Force', 'Rate limiting (Upstash Redis in production)'],
    ['Data Exposure', 'RBAC on every API route'],
    ['Password Leakage', 'bcrypt hashing, no plaintext storage'],
]
story.append(Spacer(1, 10))
story.append(make_table(['Threat', 'Mitigation'], security_rows, [0.25, 0.75]))
story.append(Paragraph('Table 8: Security threat model and mitigations', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 10: DEPLOYMENT
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('10. Deployment Guide', h1_style, 0))

story.append(Paragraph(
    'TeamForge PM is designed for deployment on Vercel, which provides seamless integration with '
    'GitHub repositories for automatic deployments on every push to the main branch. The deployment '
    'process requires configuring several environment variables in the Vercel dashboard, including '
    'the Turso database URL and authentication token, NextAuth configuration values, and the Resend '
    'API key for email notifications. The Turso database is managed separately from the hosting '
    'infrastructure, providing a clear separation between compute and storage layers.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('10.1 Environment Variables', h2_style, 1))

env_rows = [
    ['DATABASE_URL', 'Turso database connection URL', 'Required'],
    ['TURSO_DATABASE_URL', 'Turso production URL', 'Required'],
    ['TURSO_AUTH_TOKEN', 'Turso authentication token', 'Required'],
    ['NEXTAUTH_URL', 'Application base URL', 'Required'],
    ['NEXTAUTH_SECRET', 'JWT signing secret', 'Required'],
    ['RESEND_API_KEY', 'Resend email API key', 'Required'],
    ['TWILIO_ACCOUNT_SID', 'Twilio account ID', 'Optional'],
    ['TWILIO_AUTH_TOKEN', 'Twilio auth token', 'Optional'],
    ['GITHUB_TOKEN', 'GitHub PAT (agent mode)', 'Future'],
    ['VERCEL_TOKEN', 'Vercel API token (agent mode)', 'Future'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Variable', 'Description', 'Status'], env_rows, [0.25, 0.55, 0.20]))
story.append(Paragraph('Table 9: Required environment variables', caption_style))

story.append(Spacer(1, 10))
story.append(heading('10.2 Deployment Checklist', h2_style, 1))

checklist = [
    'All environment variables are set in Vercel dashboard',
    'Database migrations have run successfully with npx prisma migrate deploy',
    'Superadmin seed script has been executed to create initial admin account',
    'NextAuth secret is a strong random string generated with openssl rand -base64 32',
    'HTTPS is enabled (Vercel provides automatic SSL certificates)',
    'Email domain is verified in Resend dashboard',
    'Test all critical flows: register, login, clock in/out, create project, AI chat',
    'Custom error pages (404, 500) are implemented and tested',
    'Rate limiting is configured for authentication endpoints',
]
for item in checklist:
    story.append(Paragraph('- %s' % item, bullet_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 11: CODING CONVENTIONS
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('11. Coding Conventions', h1_style, 0))

story.append(Paragraph(
    'Consistency in code style is critical for maintainability, especially in a project that may be '
    'worked on by multiple developers or AI agents. TeamForge PM enforces a strict set of coding '
    'conventions documented in the AGENT.md file, which serves as the authoritative reference for '
    'all code contributions. These conventions cover file naming, code style, component patterns, API '
    'design, and Git commit message format. Every contribution to the codebase must adhere to these '
    'rules without exception.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('11.1 Key Rules', h2_style, 1))

conv_rows = [
    ['File Naming', 'kebab-case for all files (e.g., clock-button.tsx)'],
    ['TypeScript', 'Strict mode, no any types, proper interfaces'],
    ['Exports', 'Named exports preferred, default only for pages'],
    ['Variables', 'const over let, never var'],
    ['Forms', 'Zod validation for all inputs, React Hook Form'],
    ['Components', '"use client" when using hooks or browser APIs'],
    ['API Routes', 'try/catch all async ops, consistent JSON response'],
    ['Git Commits', 'Conventional commits: feat:, fix:, chore:, docs:'],
    ['Imports', 'React, third-party, UI components, local utils'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Convention', 'Rule'], conv_rows, [0.20, 0.80]))
story.append(Paragraph('Table 10: Key coding conventions', caption_style))

# ═══════════════════════════════════════════════════════════════
# SECTION 12: AGENT.md GUIDE
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('12. Using AGENT.md for Persistent Memory', h1_style, 0))

story.append(Paragraph(
    'The AGENT.md file is the most important configuration file in the project. It serves as a '
    'persistent memory across all development sessions, ensuring that every AI agent or developer '
    'working on the project has immediate access to the complete project context, rules, and conventions '
    'without needing to re-explain anything. At the start of every new session, the instruction is '
    'simple: "Read AGENT.md first and follow everything in it." This eliminates repetitive briefings '
    'and ensures consistency in implementation decisions across sessions.',
    body_style
))

story.append(Spacer(1, 10))
story.append(heading('12.1 What AGENT.md Contains', h2_style, 1))

agent_sections = [
    ['Project Overview', 'Name, type, description, primary language, communication style'],
    ['Tech Stack', 'Locked technology decisions with versions'],
    ['Project Structure', 'Complete directory tree with file descriptions'],
    ['Database Schema', 'Full Prisma schema with all tables and relationships'],
    ['RBAC Rules', 'Role definitions and permission matrix'],
    ['Coding Conventions', 'File naming, code style, API design patterns'],
    ['AI Protocols', 'GLM integration rules and chat protocol'],
    ['Environment Variables', 'All required and optional configuration'],
    ['Notification Rules', 'Email/SMS event triggers and templates'],
    ['Security Rules', 'Authentication, authorization, and threat mitigations'],
    ['Current Status', 'Phase tracking with completed, in-progress, and pending items'],
    ['Change Log', 'History of modifications to AGENT.md itself'],
]
story.append(Spacer(1, 8))
story.append(make_table(['Section', 'Content'], agent_sections, [0.25, 0.75]))
story.append(Paragraph('Table 11: AGENT.md section overview', caption_style))

story.append(Spacer(1, 10))
story.append(heading('12.2 How to Use It', h2_style, 1))

story.append(Paragraph(
    'At the beginning of every new development session, tell the AI assistant to read AGENT.md '
    'first. The agent will then have complete context about the project, including all technical '
    'decisions, conventions, and the current build status. When the project evolves and new '
    'decisions are made, update AGENT.md to reflect those changes. This creates a living document '
    'that grows with the project. The file also contains a status tracking section that shows which '
    'phases are completed, in progress, or pending, giving the agent a clear starting point for '
    'each session.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# SECTION 13: CREDENTIALS NEEDED
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 18))
story.append(heading('13. Credentials and Setup Requirements', h1_style, 0))

story.append(Paragraph(
    'To get TeamForge PM fully operational, several external service credentials are required. '
    'These can be provided incrementally as the project progresses through its build phases. The '
    'critical credentials needed before production deployment include the Turso database connection '
    'details and authentication token, the NextAuth secret for secure session management, and the '
    'Resend API key for email notifications. Optional credentials for Twilio SMS, GitHub integration, '
    'and Vercel API access can be added later for enhanced functionality and agent mode.',
    body_style
))

cred_rows = [
    ['Turso Database URL', 'libsql://your-db.turso.io', 'Required', 'Phase 1'],
    ['Turso Auth Token', 'From Turso dashboard', 'Required', 'Phase 1'],
    ['Resend API Key', 're_... from Resend', 'Required', 'Phase 5'],
    ['Twilio Credentials', 'SID + Auth Token', 'Optional', 'Phase 9'],
    ['GitHub Token', 'ghp_... (PAT with repo)', 'Future', 'Agent Mode'],
    ['Vercel Token', 'From Vercel dashboard', 'Future', 'Agent Mode'],
]
story.append(Spacer(1, 10))
story.append(make_table(['Credential', 'Format', 'Priority', 'Phase'], cred_rows, [0.22, 0.30, 0.20, 0.28]))
story.append(Paragraph('Table 12: Required credentials and their priority', caption_style))

story.append(Spacer(1, 10))
story.append(Paragraph(
    'If credentials are not available at the start of development, the project can still be built '
    'and tested locally using file-based SQLite as the database backend and mock email functionality. '
    'The .env.example file in the project root provides a template for all required variables with '
    'descriptions of where to obtain each value. This allows development to proceed immediately while '
    'credentials are gathered and configured at the appropriate stage of the build process.',
    body_style
))

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════
doc.multiBuild(story)
print("PDF generated successfully!")
