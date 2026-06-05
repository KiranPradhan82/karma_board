---
Task ID: 1
Agent: Main Agent
Task: Analyze Karma Space /docs failure and implement fixes

Work Log:
- Analyzed chat transcript showing /docs command failing: AI loops on web_search calls, auto-routes to SambaNova 3x, never generates documents
- Identified root cause: /docs prompt forced 5 tool calls (get_project_info, list_projects, 3x web_search) before writing anything
- web_search tool is knowledge-based stub that returns "use your training knowledge" — wastes entire agentic loop rounds
- Previous session's fixes were already applied (one-doc-at-a-time, max_tokens uncapped, history reduced, DOC_AUTO_MODEL=glm-4-flash) but prompt still forced tool usage
- Fix 1: Removed web_search from doc command tool filter in route.ts (only list_projects + get_project_info remain)
- Fix 2: Redesigned /docs prompt — removed "Step 1: Gather Data Using Tools" with 5 mandatory tool calls
- Fix 3: Added "IMPORTANT: WRITE THE DOCUMENT NOW" directive that explicitly says "Do NOT call any tools"
- Fix 4: Updated individual doc commands (/prd, /trd, etc.) with same "WRITE NOW" directive
- Fix 5: Removed web_search from system prompt tool list
- Fix 6: Reduced MAX_TOOL_ROUNDS from 8 to 4 for doc commands
- Fix 7: Updated /help text to reflect new /docs behavior (generates overview + PRD immediately)

Stage Summary:
- Modified files: src/app/api/ai/chat/route.ts, src/lib/ai-prompts.ts
- Key insight: The AI was wasting entire agentic loop rounds on fake web_search calls instead of generating content
- New behavior: /docs will produce the Project Overview + PRD in a single response with zero tool calls
- web_search tool still exists for general chat (knowledge-based research), just filtered out for doc commands

---
Task ID: 2
Agent: Main Agent
Task: Add ProjectDocument storage system for auto-saving doc commands as PDF

Work Log:
- Added ProjectDocument model to Prisma schema (id, projectId, docType, title, content, pdfData, version, timestamps) with @@unique([projectId, docType])
- Added documents relation to Project model
- Ran prisma generate + prisma db push successfully
- Created src/lib/generate-pdf.ts shared utility with generatePdfBase64() and generatePdfBufferFromContent() — reuses existing PDF theme system, sanitization, markdown parsing, and A4 rendering logic from export-pdf/route.ts
- Created /api/ai/documents/route.ts with GET (list by projectId), POST (create or upsert), PUT (update by id) endpoints
- Created /api/ai/documents/[id]/route.ts with GET endpoint that returns metadata JSON or PDF binary when ?download=true
- Modified /api/ai/chat/route.ts:
  - Added DOC_TYPE_MAP for command-to-doctype mapping
  - Added DOC_SIGNATURES array and detectDocTypeFromContent() for detecting document type from AI response content (handles update flow)
  - After saving AI response to AiChat, checks if content is a document (>500 chars, matches doc command or content signature)
  - Auto-generates PDF via generatePdfBase64(), creates or updates ProjectDocument row with version increment
  - Includes documentInfo in API response: { id, docType, title, version }
- Updated frontend (src/app/dashboard/ai-assistant/page.tsx):
  - Added documentInfo to ChatMessage interface
  - Added downloadingDocPdf state and handleDownloadDocumentPdf() function
  - Added expandedDocs state and toggleDocExpand() for collapsible document cards
  - Added DOC_TYPE_COLORS and DOC_TYPE_LABELS constants for color-coded rendering
  - Created inline DocumentCard component with: doc type badge, title, version, auto-saved label, Download PDF button, expandable markdown preview with line count
  - Updated both sendMessage and handleCommandClick to pass through documentInfo from API response
- Modified /api/ai/export-all-docs/route.ts to first try ProjectDocument table (SELECT by projectId), falling back to existing chat message detection if no stored docs found
- Build passed clean with no errors

Stage Summary:
- Modified files: prisma/schema.prisma, src/app/api/ai/chat/route.ts, src/app/api/ai/documents/route.ts, src/app/api/ai/documents/[id]/route.ts, src/app/api/ai/export-all-docs/route.ts, src/app/dashboard/ai-assistant/page.tsx, src/lib/generate-pdf.ts, worklog.md
- Key: Doc commands now auto-save PDFs to the database with version tracking
- Key: Non-command messages that match document signatures also get auto-saved (update detection)
- Key: Frontend shows rich DocumentCard with color-coded badges, download, and expandable preview
- Key: export-all-docs prefers stored documents over chat message detection
