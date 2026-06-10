---
Task ID: 4c-4g
Agent: Main Agent
Task: Rebuild z.ai Bridge with FREE Model (GLM-4.7-Flash)

Work Log:

1. Updated /api/settings/route.ts:
   - Added ZAI_BRIDGE_API_KEY to SENSITIVE_KEYS (encrypted in DB, masked in GET responses)
   - Added ZAI_BRIDGE_API_KEY, ZAI_BRIDGE_BASE_URL, ZAI_BRIDGE_MODEL to ALLOWED_KEYS

2. Created /api/settings/test-zai/route.ts:
   - GET endpoint, SUPERADMIN only
   - Reads z.ai API key from Settings, decrypts it
   - Makes test chat completion request to z.ai with 15s timeout
   - Returns { success, model, response } or { success: false, error }

3. Created /api/ai/zai-bridge/route.ts:
   - POST endpoint, any authenticated user with project access
   - Fetches all ProjectDocument rows for the project
   - Fetches z.ai settings from Settings (decrypts API key)
   - Manages chat ID mapping (ZAI_CHAT:{projectId}) in Settings table
   - Builds comprehensive project context string with all 6 documents (truncated to 8000 chars each)
   - Sends context to z.ai via API with 30s timeout (non-blocking)
   - Returns { chatId, chatUrl, context, modelName, documentsFound, isNewChat, aiResponse }

4. Modified /api/ai/chat/route.ts:
   - Added z.ai bridge logic after document auto-save, before final response JSON
   - Triggers on /init command when project has documents AND z.ai API key is configured
   - Builds context from project info + all ProjectDocument rows
   - Manages ZAI_CHAT:{projectId} mapping for session persistence
   - Sends to z.ai API non-blocking (30s timeout, failure doesn't block response)
   - Adds zaiBridge object to final response JSON

5. Modified Settings page (src/app/dashboard/settings/page.tsx):
   - Added z.ai Bridge card between Email Service card and Environment Variable Reference card
   - Added state: zaiApiKey, zaiApiKeyChanged, zaiBaseUrl, zaiModel, zaiTestStatus, zaiTesting, zaiSaving
   - Added fetchSettings loading of ZAI_BRIDGE_* keys
   - Added handleSaveZai function (saves z.ai settings via PUT /api/settings)
   - Added handleTestZai function (calls GET /api/settings/test-zai)
   - Card includes: Globe icon header, FREE model alert, API key (password), base URL, model input, Test Connection + Save buttons
   - Green checkmark when API key configured, status indicators for test results

6. Modified AI Assistant page (src/app/dashboard/ai-assistant/page.tsx):
   - Added zaiBridge to ChatMessage interface
   - Added zaiCopiedId state for copy feedback
   - Added handleOpenZai handler (copies context to clipboard, opens z.ai chat)
   - Added handleCopyZaiContext handler (copies context, shows toast)
   - Passed zaiBridge through in both sendMessage and handleCommandClick
   - Added z.ai Bridge Card UI before documentInfo check in message rendering
   - Card shows: Globe icon, user's Karmaspace name, document count badge, model name, FREE label, New/Resume session badge
   - Optional z.ai initial response preview
   - "Open in z.ai & Copy" and "Copy Context" action buttons
   - Imported toast from sonner, Globe and Copy from lucide-react

Build & Deploy:
- npx next build passed clean with zero errors
- Installed missing 'effect' dependency (pre-existing issue), ran prisma generate

Stage Summary:
- Created files: src/app/api/settings/test-zai/route.ts, src/app/api/ai/zai-bridge/route.ts
- Modified files: src/app/api/settings/route.ts, src/app/api/ai/chat/route.ts, src/app/dashboard/settings/page.tsx, src/app/dashboard/ai-assistant/page.tsx
- Key: z.ai Bridge uses GLM-4.7-Flash (FREE model) by default, no balance needed
- Key: Settings page allows SUPERADMIN to configure API key, base URL, and model
- Key: Test Connection button validates z.ai API connectivity
- Key: /init command automatically triggers z.ai bridge when documents exist and API key is configured
- Key: Bridge is non-blocking — z.ai API failure doesn't prevent returning context for clipboard use
- Key: Session persistence via ZAI_CHAT:{projectId} mapping in Settings table
