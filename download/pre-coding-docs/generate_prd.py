#!/usr/bin/env python3
"""Generate PRD (Product Requirements Document) for KarmaBoard"""
import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, CondPageBreak
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ━━ Color Palette ━━
PAGE_BG       = colors.HexColor('#f3f3f2')
SECTION_BG    = colors.HexColor('#ebeae7')
CARD_BG       = colors.HexColor('#eeedea')
TABLE_STRIPE  = colors.HexColor('#ecebea')
HEADER_FILL   = colors.HexColor('#766d51')
COVER_BLOCK   = colors.HexColor('#686048')
BORDER        = colors.HexColor('#c9c1a9')
ICON          = colors.HexColor('#98803a')
ACCENT        = colors.HexColor('#5237a5')
ACCENT_2      = colors.HexColor('#4cc187')
TEXT_PRIMARY   = colors.HexColor('#21201e')
TEXT_MUTED     = colors.HexColor('#89867f')
SEM_SUCCESS   = colors.HexColor('#43885a')
SEM_WARNING   = colors.HexColor('#ab8b4a')
SEM_ERROR     = colors.HexColor('#92413a')
SEM_INFO      = colors.HexColor('#46698d')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ━━ Styles ━━
styles = getSampleStyleSheet()

title_style = ParagraphStyle(name='DocTitle', fontName='Times New Roman', fontSize=28, leading=36, alignment=TA_CENTER, textColor=TEXT_PRIMARY, spaceAfter=12)
subtitle_style = ParagraphStyle(name='Subtitle', fontName='Calibri', fontSize=14, leading=20, alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=6)

h1_style = ParagraphStyle(name='H1', fontName='Times New Roman', fontSize=20, leading=28, textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=12)
h2_style = ParagraphStyle(name='H2', fontName='Times New Roman', fontSize=15, leading=22, textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8)
h3_style = ParagraphStyle(name='H3', fontName='Times New Roman', fontSize=12, leading=18, textColor=ACCENT, spaceBefore=10, spaceAfter=6)

body_style = ParagraphStyle(name='Body', fontName='Times New Roman', fontSize=10.5, leading=17, alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=6)
bullet_style = ParagraphStyle(name='Bullet', fontName='Times New Roman', fontSize=10.5, leading=17, alignment=TA_LEFT, textColor=TEXT_PRIMARY, leftIndent=20, bulletIndent=8, spaceAfter=4)
caption_style = ParagraphStyle(name='Caption', fontName='Calibri', fontSize=9, leading=14, alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6)

header_cell = ParagraphStyle(name='HeaderCell', fontName='Times New Roman', fontSize=10, leading=14, alignment=TA_CENTER, textColor=TABLE_HEADER_TEXT)
cell_style = ParagraphStyle(name='Cell', fontName='Times New Roman', fontSize=9.5, leading=14, alignment=TA_LEFT, textColor=TEXT_PRIMARY, wordWrap='CJK')
cell_center = ParagraphStyle(name='CellCenter', fontName='Times New Roman', fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=TEXT_PRIMARY)

toc_h1 = ParagraphStyle(name='TOCH1', fontSize=13, leftIndent=20, fontName='Times New Roman', textColor=TEXT_PRIMARY)
toc_h2 = ParagraphStyle(name='TOCH2', fontSize=11, leftIndent=40, fontName='Times New Roman', textColor=TEXT_PRIMARY)

# ━━ TOC Template ━━
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

A4_W, A4_H = A4
avail_h = A4_H - 2*inch
H1_ORPHAN = avail_h * 0.15

def add_major(text, style):
    return [CondPageBreak(H1_ORPHAN), add_heading(text, style, level=0)]

def safe_keep(elements):
    total = sum(e.wrap(avail := A4_W - 2*inch, A4_H)[1] for e in elements)
    if total <= avail_h * 0.4:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def make_table(data, col_ratios, caption=None):
    avail = A4_W - 2*inch
    widths = [r * avail for r in col_ratios]
    t = Table(data, colWidths=widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_ODD if i % 2 == 0 else TABLE_ROW_EVEN
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    elements = [Spacer(1, 18), t]
    if caption:
        elements.append(Paragraph(caption, caption_style))
    elements.append(Spacer(1, 18))
    return elements

# ━━ Build Document ━━
OUTPUT = '/home/z/my-project/download/pre-coding-docs/KarmaBoard_PRD.pdf'
doc = TocDocTemplate(OUTPUT, pagesize=A4, leftMargin=1*inch, rightMargin=1*inch, topMargin=1*inch, bottomMargin=1*inch)
doc.add_metadata({'/Title': 'KarmaBoard Product Requirements Document', '/Author': 'Z.ai', '/Creator': 'Z.ai'})

story = []

# ── Title Page ──
story.append(Spacer(1, 120))
story.append(Paragraph('<b>KarmaBoard</b>', title_style))
story.append(Spacer(1, 8))
story.append(Paragraph('Product Requirements Document', subtitle_style))
story.append(Spacer(1, 12))
story.append(Paragraph('Version 1.0 | June 2026', ParagraphStyle(name='Meta', fontName='Calibri', fontSize=11, alignment=TA_CENTER, textColor=TEXT_MUTED)))
story.append(Spacer(1, 30))

# Info table
info_data = [
    [Paragraph('<b>Document Type</b>', cell_center), Paragraph('<b>Product Requirements</b>', cell_center)],
    [Paragraph('<b>Product</b>', cell_center), Paragraph('KarmaBoard v0.2.0', cell_center)],
    [Paragraph('<b>Author</b>', cell_center), Paragraph('Kiran Pradhan', cell_center)],
    [Paragraph('<b>Status</b>', cell_center), Paragraph('Draft', cell_center)],
    [Paragraph('<b>Classification</b>', cell_center), Paragraph('Internal', cell_center)],
]
info_t = Table(info_data, colWidths=[150, 200], hAlign='CENTER')
info_t.setStyle(TableStyle([
    ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('BACKGROUND', (0, 0), (0, -1), TABLE_STRIPE),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
]))
story.append(info_t)
story.append(PageBreak())

# ── TOC ──
story.append(Paragraph('<b>Table of Contents</b>', ParagraphStyle(name='TOCTitle', fontName='Times New Roman', fontSize=22, alignment=TA_CENTER, textColor=TEXT_PRIMARY, spaceAfter=18)))
toc = TableOfContents()
toc.levelStyles = [toc_h1, toc_h2]
story.append(toc)
story.append(PageBreak())

# ═══════════════════════════════════════════════
# 1. EXECUTIVE SUMMARY
# ═══════════════════════════════════════════════
story.extend(add_major('<b>1. Executive Summary</b>', h1_style))
story.append(Paragraph(
    'KarmaBoard is a full-stack project management SaaS platform designed to streamline team collaboration, project lifecycle management, and client communication within a single unified application. Built on a modern technology stack comprising Next.js 16, React 19, TypeScript, Tailwind CSS 4, and Prisma ORM with Turso SQLite as the database backend, KarmaBoard delivers a responsive, performant, and visually polished experience across all device form factors.',
    body_style
))
story.append(Paragraph(
    'The platform addresses a critical gap in the project management landscape by providing an integrated AI assistant (Karma Space) that leverages agentic tool-calling capabilities to automate project workflows directly from natural language conversations. Unlike traditional project management tools that require manual data entry and navigation through multiple screens, KarmaBoard allows users to create projects, manage team assignments, and generate comprehensive documentation through conversational AI interactions. The system supports up to five concurrent tool-calling rounds, enabling complex multi-step operations within a single user request.',
    body_style
))
story.append(Paragraph(
    'KarmaBoard implements a comprehensive Role-Based Access Control (RBAC) system with three organizational roles (SUPERADMIN, ADMIN, MEMBER) and five project-specific roles (LEAD, DEVELOPER, MARKETER, VIEWER, MEMBER), ensuring that sensitive operations remain restricted to authorized personnel. The platform also includes a dedicated Client Portal that provides external stakeholders with controlled visibility into project progress, notifications, and activity logs without exposing internal team dynamics or administrative interfaces.',
    body_style
))
story.append(Paragraph(
    'Key differentiators of KarmaBoard include its dual email provider architecture supporting both Gmail SMTP for development and Resend for production deployments, AES-256-GCM encryption for sensitive configuration values, per-project AI model customization, and a documentation generation system that can produce professional-grade PDF reports directly from project data. The platform is deployed on Vercel with Turso as the cloud database provider, ensuring scalable, serverless-compatible operation.',
    body_style
))

# ═══════════════════════════════════════════════
# 2. PRODUCT VISION & OBJECTIVES
# ═══════════════════════════════════════════════
story.extend(add_major('<b>2. Product Vision and Objectives</b>', h1_style))
story.append(Paragraph('<b>2.1 Vision Statement</b>', h2_style))
story.append(Paragraph(
    'KarmaBoard aims to become the definitive project management platform for small to mid-size development agencies and in-house product teams by combining traditional project management capabilities with an intelligent AI assistant that understands project context, enforces organizational policies, and automates repetitive workflows through natural language interaction. The vision centers on reducing the friction between planning and execution by embedding AI directly into the project workflow rather than treating it as a separate add-on feature.',
    body_style
))

story.append(Paragraph('<b>2.2 Strategic Objectives</b>', h2_style))
objectives = [
    ('Unified Workspace', 'Consolidate project tracking, team management, client communication, and AI-assisted documentation into a single platform, eliminating the need for multiple disconnected tools.'),
    ('AI-First Workflow', 'Provide an agentic AI assistant capable of executing multi-step project operations (creating projects, assigning teams, generating documentation) through natural language commands with a maximum of 5 tool-calling rounds per interaction.'),
    ('Enterprise-Grade Security', 'Implement comprehensive RBAC, AES-256-GCM encryption for sensitive data, JWT-based authentication with NextAuth.js, and a complete audit trail through the ActivityLog system.'),
    ('Client Transparency', 'Offer a dedicated Client Portal with controlled project visibility, real-time notifications, and activity tracking that keeps external stakeholders informed without compromising internal operations.'),
    ('Scalable Architecture', 'Build on a serverless-compatible stack (Next.js on Vercel, Turso SQLite) that supports horizontal scaling while maintaining sub-second response times for standard operations.'),
]
for title, desc in objectives:
    story.append(Paragraph('<b>%s:</b> %s' % (title, desc), bullet_style))

story.append(Paragraph('<b>2.3 Success Metrics</b>', h2_style))
metrics_data = [
    [Paragraph('<b>Metric</b>', header_cell), Paragraph('<b>Target</b>', header_cell), Paragraph('<b>Timeline</b>', header_cell)],
    [Paragraph('Team Adoption Rate', cell_style), Paragraph('80% daily active usage', cell_center), Paragraph('6 months', cell_center)],
    [Paragraph('AI Task Completion Rate', cell_style), Paragraph('95% accuracy on tool calls', cell_center), Paragraph('3 months', cell_center)],
    [Paragraph('Client Portal Engagement', cell_style), Paragraph('70% weekly login rate', cell_center), Paragraph('6 months', cell_center)],
    [Paragraph('Average Project Setup Time', cell_style), Paragraph('Under 2 minutes via AI', cell_center), Paragraph('3 months', cell_center)],
    [Paragraph('System Uptime', cell_style), Paragraph('99.9% availability', cell_center), Paragraph('Ongoing', cell_center)],
]
story.extend(make_table(metrics_data, [0.40, 0.35, 0.25], 'Table 1: Key Performance Indicators'))

# ═══════════════════════════════════════════════
# 3. TARGET AUDIENCE
# ═══════════════════════════════════════════════
story.extend(add_major('<b>3. Target Audience and User Personas</b>', h1_style))

story.append(Paragraph('<b>3.1 Primary Users: Development Agencies</b>', h2_style))
story.append(Paragraph(
    'The primary target audience for KarmaBoard consists of small to mid-size web development agencies (5-50 team members) that manage multiple client projects simultaneously. These agencies typically struggle with tool fragmentation, using separate applications for project tracking, team communication, client reporting, and documentation. KarmaBoard addresses this by consolidating all these functions into a single platform with a consistent interface and shared data model. Agency owners and project managers benefit from the SUPERADMIN and ADMIN roles, which provide full control over team management, client relationships, and system configuration.',
    body_style
))

story.append(Paragraph('<b>3.2 Secondary Users: In-House Product Teams</b>', h2_style))
story.append(Paragraph(
    'In-house product teams within larger organizations represent a secondary target audience. These teams need project management capabilities without the complexity of enterprise solutions like Jira or Asana. The MEMBER role with project-specific assignments (DEVELOPER, MARKETER, VIEWER) provides granular access control that matches typical team structures. The AI assistant serves as a productivity multiplier, allowing team members to query project status, generate reports, and manage tasks through natural language rather than navigating complex UI hierarchies.',
    body_style
))

story.append(Paragraph('<b>3.3 External Users: Clients</b>', h2_style))
story.append(Paragraph(
    'Clients of development agencies represent the third user category, interacting with KarmaBoard exclusively through the Client Portal. This dedicated interface provides a simplified view of project progress, notifications for status changes (STARTED, UPDATE, COMPLETED), and self-service profile management. Clients cannot access team details, internal communications, AI features, or administrative functions, ensuring that sensitive internal information remains protected while maintaining transparent client communication.',
    body_style
))

# User personas table
persona_data = [
    [Paragraph('<b>Persona</b>', header_cell), Paragraph('<b>Role</b>', header_cell), Paragraph('<b>Goals</b>', header_cell), Paragraph('<b>Pain Points</b>', header_cell)],
    [Paragraph('Agency Owner', cell_style), Paragraph('SUPERADMIN', cell_center), Paragraph('Full visibility, team control, client management', cell_style), Paragraph('Tool fragmentation, reporting overhead', cell_style)],
    [Paragraph('Project Manager', cell_style), Paragraph('ADMIN', cell_center), Paragraph('Project delivery, team allocation', cell_style), Paragraph('Manual status updates, communication gaps', cell_style)],
    [Paragraph('Developer', cell_style), Paragraph('MEMBER / LEAD', cell_center), Paragraph('Task clarity, context access', cell_style), Paragraph('Context switching, scattered info', cell_style)],
    [Paragraph('Client', cell_style), Paragraph('CLIENT', cell_center), Paragraph('Project visibility, updates', cell_style), Paragraph('Lack of transparency, late surprises', cell_style)],
]
story.extend(make_table(persona_data, [0.18, 0.15, 0.35, 0.32], 'Table 2: User Personas'))

# ═══════════════════════════════════════════════
# 4. FEATURE REQUIREMENTS
# ═══════════════════════════════════════════════
story.extend(add_major('<b>4. Feature Requirements</b>', h1_style))

story.append(Paragraph('<b>4.1 Authentication and Authorization</b>', h2_style))
story.append(Paragraph(
    'The authentication system must support multiple user types with distinct login flows and permission levels. Team members authenticate through the main login page using email and password credentials verified against the User table, while clients authenticate through a separate client login page verified against the Client table. The system uses NextAuth.js v4 with a credentials-only provider and JWT strategy, ensuring stateless authentication compatible with serverless deployment on Vercel.',
    body_style
))
auth_reqs = [
    ('AUTH-001', 'Multi-user authentication supporting team members and clients with separate login flows and session types.'),
    ('AUTH-002', 'JWT-based sessions with custom claims including role, account type, and must-change-password flag.'),
    ('AUTH-003', 'First-time password flow with forced password change on initial login for both team members and clients.'),
    ('AUTH-004', 'Superadmin setup flow that activates only when no superadmin account exists in the database.'),
    ('AUTH-005', 'Protected route middleware that enforces role-based access at the page level for all dashboard and client portal routes.'),
]
for req_id, desc in auth_reqs:
    story.append(Paragraph('<b>%s:</b> %s' % (req_id, desc), bullet_style))

story.append(Paragraph('<b>4.2 Project Management</b>', h2_style))
story.append(Paragraph(
    'Projects form the core organizational unit of KarmaBoard. Each project supports a comprehensive lifecycle from creation through completion, with rich metadata including priority levels (HIGH, MEDIUM, LOW), status tracking (ACTIVE, COMPLETED, ON_HOLD, ARCHIVED), color coding, deadline management, and optional client association. The system supports inline client creation during project setup, allowing users to create a new client record simultaneously without navigating to a separate client management screen.',
    body_style
))
proj_reqs = [
    ('PROJ-001', 'Full CRUD operations for projects with search, filter by status/priority, sort by multiple criteria, and pagination.'),
    ('PROJ-002', 'Priority classification (HIGH, MEDIUM, LOW) with visual indicators and filterable views.'),
    ('PROJ-003', 'Status lifecycle management (ACTIVE, COMPLETED, ON_HOLD, ARCHIVED) with soft delete via archival.'),
    ('PROJ-004', 'Color-coded projects with hex color picker for visual differentiation in list and detail views.'),
    ('PROJ-005', 'Deadline tracking with date picker and visual deadline proximity indicators.'),
    ('PROJ-006', 'Inline client creation during project setup (clientId: "new" with newClient object).'),
    ('PROJ-007', 'Team management per project with role assignment (LEAD, DEVELOPER, MARKETER, VIEWER, MEMBER).'),
]
for req_id, desc in proj_reqs:
    story.append(Paragraph('<b>%s:</b> %s' % (req_id, desc), bullet_style))

story.append(Paragraph('<b>4.3 Team Management</b>', h2_style))
story.append(Paragraph(
    'The team management module provides comprehensive member lifecycle management from creation through archival and restoration. SUPERADMIN and ADMIN users can create new team members who receive automatically generated temporary passwords (12 characters, alphanumeric) and welcome emails. The system supports bulk operations for efficiency and maintains a complete audit trail of all member-related actions through the ActivityLog table.',
    body_style
))
team_reqs = [
    ('TEAM-001', 'Member creation with auto-generated temporary password and welcome email dispatch.'),
    ('TEAM-002', 'Member CRUD with search, filter, pagination, and sort capabilities.'),
    ('TEAM-003', 'Soft delete with restore capability (deletedAt timestamp pattern).'),
    ('TEAM-004', 'Bulk delete operation with confirmation dialog and audit logging.'),
    ('TEAM-005', 'Self-service profile editing for all team members via /members/me endpoints.'),
    ('TEAM-006', 'Project assignment with per-project role differentiation.'),
]
for req_id, desc in team_reqs:
    story.append(Paragraph('<b>%s:</b> %s' % (req_id, desc), bullet_style))

story.append(Paragraph('<b>4.4 Client Management and Portal</b>', h2_style))
story.append(Paragraph(
    'The client management system serves as a lightweight CRM integrated directly into the project management workflow. SUPERADMIN users maintain client records including company information, contact details, and notes. The Client Portal provides external stakeholders with a controlled interface for viewing linked projects, receiving notifications about project status changes, and managing their own profiles. Notifications are delivered through a dual channel: saved to the ClientNotification table for in-portal viewing and simultaneously sent via email.',
    body_style
))
client_reqs = [
    ('CLNT-001', 'Client CRM with name, email, company, address, phone, and notes fields.'),
    ('CLNT-002', 'Dedicated Client Portal with project visibility, notifications, and profile management.'),
    ('CLNT-003', 'Notification system supporting STARTED, UPDATE, and COMPLETED event types.'),
    ('CLNT-004', 'Dual notification delivery: database storage plus email dispatch.'),
    ('CLNT-005', 'Activity log viewing from client perspective showing relevant project events.'),
    ('CLNT-006', 'Soft delete via status change (ACTIVE to INACTIVE) with project unlinking.'),
]
for req_id, desc in client_reqs:
    story.append(Paragraph('<b>%s:</b> %s' % (req_id, desc), bullet_style))

story.append(Paragraph('<b>4.5 AI Assistant (Karma Space)</b>', h2_style))
story.append(Paragraph(
    'Karma Space represents the most distinctive feature of KarmaBoard, providing an agentic AI assistant integrated directly into the project context. Unlike simple chatbots, Karma Space implements a tool-calling loop (maximum 5 rounds) that allows the AI to execute real operations on the project data: creating projects, listing and filtering projects, retrieving detailed project information, updating project properties, and adding team members. The system supports multiple AI model providers through an OpenAI-compatible HTTP client, with per-project model customization available to SUPERADMIN users.',
    body_style
))
ai_reqs = [
    ('AI-001', 'Conversational AI interface with project-context-aware responses and tool calling.'),
    ('AI-002', 'Agentic tool loop (max 5 rounds) supporting 5 tools: create_project, list_projects, get_project_info, update_project, add_project_member.'),
    ('AI-003', 'Multi-provider AI support (Groq, OpenAI, Together AI) via OpenAI-compatible API.'),
    ('AI-004', 'Vision support with automatic model switching for non-multimodal models and multi-image upload (up to 5 images, 10MB each).'),
    ('AI-005', 'Per-project AI model selection configurable by SUPERADMIN through settings.'),
    ('AI-006', 'Documentation generation slash commands (/docs, /prd, /trd, /flow, /ux, /schema, /plan, /help).'),
    ('AI-007', 'Protocol management system for customizable documentation generation workflows.'),
    ('AI-008', 'PDF report generation from project data including details, team, and chat history.'),
    ('AI-009', 'Role-based tool filtering: ADMIN+ gets all tools, MEMBER gets read-only tools.'),
]
for req_id, desc in ai_reqs:
    story.append(Paragraph('<b>%s:</b> %s' % (req_id, desc), bullet_style))

story.append(Paragraph('<b>4.6 Dashboard and Analytics</b>', h2_style))
story.append(Paragraph(
    'The dashboard provides an at-a-glance overview of key organizational metrics through a responsive card-based layout. Statistics include total projects, active team members, hours tracked today, and active sessions. The dashboard serves as the landing page after authentication, presenting a personalized welcome message and recent activity feed. The layout adapts to different screen sizes, displaying a 2-column grid on mobile devices and a 4-column grid on desktop viewports.',
    body_style
))

story.append(Paragraph('<b>4.7 Settings and Configuration</b>', h2_style))
story.append(Paragraph(
    'The settings module, accessible exclusively to SUPERADMIN users, provides centralized management of all platform configuration. This includes email provider settings (Gmail SMTP or Resend), AI model configuration (API keys, base URLs, default models), and general application settings. Sensitive configuration values such as API keys and SMTP passwords are encrypted at rest using AES-256-GCM encryption with a dedicated encryption key. The settings system implements a key-value store pattern in the database, with automatic fallback to environment variables when database settings are not configured.',
    body_style
))

story.append(Paragraph('<b>4.8 Notifications and Email System</b>', h2_style))
story.append(Paragraph(
    'The notification system provides a dual-channel delivery mechanism for client-facing communications. When a team member triggers a client notification (via the notify endpoint), the system saves the notification to the ClientNotification table and simultaneously dispatches an email through the configured email provider. The email system supports two providers: Gmail SMTP for development/testing environments and Resend for production deployments with custom domain support. Three pre-built email templates handle team member welcome, client welcome, and project status update communications.',
    body_style
))

# ═══════════════════════════════════════════════
# 5. NON-FUNCTIONAL REQUIREMENTS
# ═══════════════════════════════════════════════
story.extend(add_major('<b>5. Non-Functional Requirements</b>', h1_style))

nfr_data = [
    [Paragraph('<b>Category</b>', header_cell), Paragraph('<b>Requirement</b>', header_cell), Paragraph('<b>Specification</b>', header_cell)],
    [Paragraph('Performance', cell_style), Paragraph('Page Load Time', cell_style), Paragraph('Under 3 seconds for initial load, under 1 second for navigation', cell_style)],
    [Paragraph('Performance', cell_style), Paragraph('API Response Time', cell_style), Paragraph('Under 500ms for CRUD operations, under 10s for AI responses', cell_style)],
    [Paragraph('Scalability', cell_style), Paragraph('Concurrent Users', cell_style), Paragraph('Support 100+ concurrent users without degradation', cell_style)],
    [Paragraph('Security', cell_style), Paragraph('Data Encryption', cell_style), Paragraph('AES-256-GCM for sensitive settings, bcrypt for passwords', cell_style)],
    [Paragraph('Security', cell_style), Paragraph('Authentication', cell_style), Paragraph('JWT-based with configurable session expiry', cell_style)],
    [Paragraph('Availability', cell_style), Paragraph('Uptime Target', cell_style), Paragraph('99.9% monthly availability', cell_style)],
    [Paragraph('Compatibility', cell_style), Paragraph('Browser Support', cell_style), Paragraph('Chrome, Firefox, Safari, Edge (latest 2 versions)', cell_style)],
    [Paragraph('Compatibility', cell_style), Paragraph('Device Support', cell_style), Paragraph('Responsive design for mobile, tablet, and desktop', cell_style)],
    [Paragraph('Maintainability', cell_style), Paragraph('Code Coverage', cell_style), Paragraph('Target 70%+ test coverage for critical paths', cell_style)],
]
story.extend(make_table(nfr_data, [0.15, 0.25, 0.60], 'Table 3: Non-Functional Requirements'))

# ═══════════════════════════════════════════════
# 6. RBAC REQUIREMENTS
# ═══════════════════════════════════════════════
story.extend(add_major('<b>6. Role-Based Access Control Requirements</b>', h1_style))
story.append(Paragraph(
    'The RBAC system implements a two-tier permission model that combines organizational roles with project-specific roles. Organizational roles (SUPERADMIN, ADMIN, MEMBER) determine global access to system features, while project roles (LEAD, DEVELOPER, MARKETER, VIEWER, MEMBER) control access within individual project contexts. This dual-layer approach enables fine-grained access control that matches typical agency team structures where a developer may have different responsibilities across different projects.',
    body_style
))

rbac_data = [
    [Paragraph('<b>Feature</b>', header_cell), Paragraph('<b>SUPERADMIN</b>', header_cell), Paragraph('<b>ADMIN</b>', header_cell), Paragraph('<b>MEMBER</b>', header_cell), Paragraph('<b>CLIENT</b>', header_cell)],
    [Paragraph('View All Projects', cell_style), Paragraph('Full', cell_center), Paragraph('Own', cell_center), Paragraph('Own', cell_center), Paragraph('Linked', cell_center)],
    [Paragraph('Create Project', cell_style), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Update Project', cell_style), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Delete Project', cell_style), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Manage Team', cell_style), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Manage Clients', cell_style), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Settings', cell_style), Paragraph('Yes', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center)],
    [Paragraph('AI Full Tools', cell_style), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('Read-only', cell_center), Paragraph('No', cell_center)],
    [Paragraph('Client Portal', cell_style), Paragraph('No', cell_center), Paragraph('No', cell_center), Paragraph('No', cell_center), Paragraph('Yes', cell_center)],
    [Paragraph('Edit Profile', cell_style), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center), Paragraph('Yes', cell_center)],
]
story.extend(make_table(rbac_data, [0.22, 0.18, 0.18, 0.18, 0.18], 'Table 4: RBAC Permission Matrix'))

# ═══════════════════════════════════════════════
# 7. SCOPE AND CONSTRAINTS
# ═══════════════════════════════════════════════
story.extend(add_major('<b>7. Scope, Constraints, and Assumptions</b>', h1_style))

story.append(Paragraph('<b>7.1 In Scope (v1.0)</b>', h2_style))
in_scope = [
    'Full project lifecycle management with CRUD operations, filtering, search, and pagination.',
    'Team management with role-based access, project assignment, and profile self-service.',
    'Client CRM with dedicated portal, notification system, and dual-channel delivery.',
    'AI assistant with agentic tool calling, vision support, and documentation generation.',
    'Dashboard with key metrics and recent activity visualization.',
    'Settings management with encrypted storage for sensitive configuration values.',
    'Email system with dual provider support (Gmail SMTP and Resend).',
    'Activity logging and audit trail for all system mutations.',
]
for item in in_scope:
    story.append(Paragraph(item, bullet_style, bulletText='\xe2\x80\xa2'))

story.append(Paragraph('<b>7.2 Out of Scope (Future Versions)</b>', h2_style))
out_scope = [
    'Native mobile applications (iOS/Android) -- current focus is responsive web only.',
    'Real-time collaboration features (WebSocket-based live editing, presence indicators).',
    'Time tracking module (schema defined but page UI not yet implemented).',
    'Kanban board view for task management within projects.',
    'API rate limiting and usage-based billing for multi-tenant SaaS operation.',
    'Automated testing pipeline and CI/CD integration documentation.',
    'Internationalization (i18n) and multi-language support beyond English.',
]
for item in out_scope:
    story.append(Paragraph(item, bullet_style, bulletText='\xe2\x80\xa2'))

story.append(Paragraph('<b>7.3 Assumptions</b>', h2_style))
story.append(Paragraph(
    'The following assumptions underpin the product requirements and architecture decisions made during the design of KarmaBoard. First, the target deployment environment is Vercel with Turso as the cloud database provider, which constrains certain architectural choices (no long-lived database connections, serverless function timeouts). Second, the initial user base is expected to be small (under 100 users), which allows the use of SQLite via Turso rather than a traditional multi-tenant PostgreSQL setup. Third, AI API costs are assumed to be manageable within a reasonable budget given the expected usage patterns (occasional AI interactions rather than continuous streaming). Fourth, all users are expected to have modern browsers with JavaScript enabled, as the application relies heavily on client-side rendering.',
    body_style
))

# ═══════════════════════════════════════════════
# 8. ACCEPTANCE CRITERIA
# ═══════════════════════════════════════════════
story.extend(add_major('<b>8. Acceptance Criteria</b>', h1_style))
story.append(Paragraph(
    'The following acceptance criteria define the minimum requirements for considering KarmaBoard v1.0 production-ready. Each criterion must be verified through manual testing or automated test suites before the product can be released to end users. These criteria serve as the gate between development and deployment, ensuring that critical functionality operates correctly under expected conditions.',
    body_style
))
accept_data = [
    [Paragraph('<b>ID</b>', header_cell), Paragraph('<b>Criterion</b>', header_cell), Paragraph('<b>Priority</b>', header_cell)],
    [Paragraph('AC-001', cell_center), Paragraph('User can register, login, and access role-appropriate dashboard.', cell_style), Paragraph('P0', cell_center)],
    [Paragraph('AC-002', cell_center), Paragraph('SUPERADMIN can complete initial setup and create first admin account.', cell_style), Paragraph('P0', cell_center)],
    [Paragraph('AC-003', cell_center), Paragraph('Projects can be created, listed, filtered, and archived through UI.', cell_style), Paragraph('P0', cell_center)],
    [Paragraph('AC-004', cell_center), Paragraph('Team members can be created, assigned to projects, and removed.', cell_style), Paragraph('P0', cell_center)],
    [Paragraph('AC-005', cell_center), Paragraph('AI assistant responds to queries and executes tool calls correctly.', cell_style), Paragraph('P0', cell_center)],
    [Paragraph('AC-006', cell_center), Paragraph('Client portal shows linked projects and notifications correctly.', cell_style), Paragraph('P1', cell_center)],
    [Paragraph('AC-007', cell_center), Paragraph('Email notifications are sent through configured provider.', cell_style), Paragraph('P1', cell_center)],
    [Paragraph('AC-008', cell_center), Paragraph('Settings page saves and retrieves encrypted configuration values.', cell_style), Paragraph('P1', cell_center)],
    [Paragraph('AC-009', cell_center), Paragraph('All pages render correctly on mobile (375px), tablet (768px), desktop (1440px).', cell_style), Paragraph('P1', cell_center)],
    [Paragraph('AC-010', cell_center), Paragraph('Activity log records all mutations with user ID, action, and timestamp.', cell_style), Paragraph('P2', cell_center)],
]
story.extend(make_table(accept_data, [0.10, 0.70, 0.12], 'Table 5: Acceptance Criteria'))

# ═══════════════════════════════════════════════
# 9. GLOSSARY
# ═══════════════════════════════════════════════
story.extend(add_major('<b>9. Glossary</b>', h1_style))
glossary_data = [
    [Paragraph('<b>Term</b>', header_cell), Paragraph('<b>Definition</b>', header_cell)],
    [Paragraph('RBAC', cell_style), Paragraph('Role-Based Access Control -- a method of regulating access based on user roles.', cell_style)],
    [Paragraph('JWT', cell_style), Paragraph('JSON Web Token -- a compact, URL-safe token for securely transmitting information.', cell_style)],
    [Paragraph('Agentic Loop', cell_style), Paragraph('An AI interaction pattern where the model can call tools and receive results across multiple rounds.', cell_style)],
    [Paragraph('Soft Delete', cell_style), Paragraph('Marking records as deleted without removing them from the database, using timestamps or status flags.', cell_style)],
    [Paragraph('Turso', cell_style), Paragraph('A serverless SQLite platform providing libSQL-compatible database hosting in the cloud.', cell_style)],
    [Paragraph('Karma Space', cell_style), Paragraph('The AI assistant module within KarmaBoard, providing conversational project management capabilities.', cell_style)],
    [Paragraph('Client Portal', cell_style), Paragraph('A separate interface for external clients to view project progress and receive notifications.', cell_style)],
]
story.extend(make_table(glossary_data, [0.20, 0.80], 'Table 6: Glossary of Terms'))

# ━━ Build ━━
doc.multiBuild(story)
print(f'PRD generated: {OUTPUT}')
