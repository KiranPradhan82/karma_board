import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { encrypt, decrypt, maskSensitive } from '@/lib/encryption';
import { invalidateSettingsCache } from '@/lib/settings-resolver';
import { hasFeaturePermission } from '@/lib/feature-permissions';

// Settings keys that should be encrypted in DB
const SENSITIVE_KEYS = [
  'RESEND_API_KEY', 'SMTP_PASSWORD', 'ZAI_BRIDGE_API_KEY', 'ZAI_BRIDGE_PASSWORD', 'ZAI_BRIDGE_GOOGLE_TOKEN',
  // AI Provider keys
  'GROQ_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY', 'TOGETHER_API_KEY',
  'ZAI_API_KEY', 'SAMBANOVA_API_KEY', 'OPENROUTER_API_KEY', 'AI_API_KEY',
  // GitHub PAT
  'GITHUB_PAT',
];

// Allowed setting keys
const ALLOWED_KEYS = [
  'EMAIL_PROVIDER',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_FROM_NAME',
  'EMAIL_FROM_NAME',
  'SMTP_USER',
  'SMTP_PASSWORD',
  // PDF Theme (JSON object with color keys)
  'PDF_THEME',
  // z.ai Bridge credentials
  'ZAI_BRIDGE_API_KEY',
  'ZAI_BRIDGE_BASE_URL',
  'ZAI_BRIDGE_MODEL',
  // z.ai Bridge login method
  'ZAI_BRIDGE_LOGIN_METHOD',
  'ZAI_BRIDGE_EMAIL',
  'ZAI_BRIDGE_PASSWORD',
  'ZAI_BRIDGE_GOOGLE_TOKEN',
  // Branding
  'BRANDING_LOGO',
  // AI Provider API Keys
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'TOGETHER_API_KEY',
  'ZAI_API_KEY',
  'SAMBANOVA_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_API_KEY',
  // AI Provider Base URLs
  'GROQ_API_BASE_URL',
  'OPENAI_API_BASE_URL',
  'GOOGLE_AI_API_BASE_URL',
  'TOGETHER_API_BASE_URL',
  'ZAI_API_BASE_URL',
  'SAMBANOVA_API_BASE_URL',
  'OPENROUTER_API_BASE_URL',
  'AI_API_BASE_URL',
  // GitHub
  'GITHUB_PAT',
  // Default AI model
  'DEFAULT_AI_MODEL',
];

// GET /api/settings — Fetch all settings (sensitive values masked)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // SUPERADMIN always has access; ADMIN needs settings_access or token_management
    if (user.role === 'SUPERADMIN') {
      // pass
    } else if (user.role === 'ADMIN') {
      const canAccess = await hasFeaturePermission(user.id, user.role, 'settings_access');
      const canTokens = await hasFeaturePermission(user.id, user.role, 'token_management');
      if (!canAccess && !canTokens) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const client = getTursoClient();

    const result = await client.execute({
      sql: 'SELECT key, value, updatedAt FROM "Settings"',
      args: [],
    });

    const settings: Record<string, { value: string; masked: boolean; updatedAt: string | null }> = {};

    for (const row of result.rows) {
      const key = row.key as string;
      const rawValue = row.value as string;
      const updatedAt = row.updatedAt as string;

      if (SENSITIVE_KEYS.includes(key)) {
        try {
          const decrypted = decrypt(rawValue);
          settings[key] = {
            value: maskSensitive(decrypted),
            masked: true,
            updatedAt,
          };
        } catch {
          settings[key] = {
            value: maskSensitive(rawValue),
            masked: true,
            updatedAt,
          };
        }
      } else {
        settings[key] = {
          value: rawValue,
          masked: false,
          updatedAt,
        };
      }
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('[GET /api/settings] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/settings — Update settings (encrypts sensitive values)
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ success: false, error: 'Settings object is required' }, { status: 400 });
    }

    // SUPERADMIN always has access; ADMIN needs appropriate permission per key
    if (user.role !== 'SUPERADMIN') {
      const TOKEN_KEYS = new Set([
        'GROQ_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY', 'TOGETHER_API_KEY',
        'ZAI_API_KEY', 'SAMBANOVA_API_KEY', 'OPENROUTER_API_KEY', 'AI_API_KEY',
        'GROQ_API_BASE_URL', 'OPENAI_API_BASE_URL', 'GOOGLE_AI_API_BASE_URL',
        'TOGETHER_API_BASE_URL', 'ZAI_API_BASE_URL', 'SAMBANOVA_API_BASE_URL',
        'OPENROUTER_API_BASE_URL', 'AI_API_BASE_URL', 'GITHUB_PAT', 'DEFAULT_AI_MODEL',
      ]);
      const requestedKeys = Object.keys(settings);
      const hasTokenKey = requestedKeys.some((k) => TOKEN_KEYS.has(k));
      const hasGeneralKey = requestedKeys.some((k) => !TOKEN_KEYS.has(k));

      if (hasTokenKey) {
        const canTokens = await hasFeaturePermission(user.id, user.role, 'token_management');
        if (!canTokens) {
          return NextResponse.json({ success: false, error: 'Insufficient permissions for token management' }, { status: 403 });
        }
      }
      if (hasGeneralKey) {
        const canSettings = await hasFeaturePermission(user.id, user.role, 'settings_access');
        if (!canSettings) {
          return NextResponse.json({ success: false, error: 'Insufficient permissions for settings' }, { status: 403 });
        }
      }
    }

    const client = getTursoClient();
    const ip = getClientIp(request);
    const updatedKeys: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.includes(key)) {
        return NextResponse.json(
          { success: false, error: `Unknown setting key: ${key}` },
          { status: 400 }
        );
      }

      const stringValue = typeof value === 'string' ? value : String(value);
      const storedValue = SENSITIVE_KEYS.includes(key) ? encrypt(stringValue) : stringValue;
      const now = new Date().toISOString();

      // Upsert using SQLite INSERT OR REPLACE
      await client.execute({
        sql: `INSERT INTO "Settings" (key, value, updatedAt) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, "updatedAt" = excluded."updatedAt"`,
        args: [key, storedValue, now],
      });

      updatedKeys.push(key);
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'UPDATE_SETTINGS',
      details: `Updated settings: ${updatedKeys.join(', ')}`,
      entity: 'settings',
      ipAddress: ip,
      tursoClient: client,
    });

    // Invalidate settings-resolver cache so AI chat picks up new keys immediately
    const hasAiKey = updatedKeys.some(k => k.includes('API_KEY') || k.includes('BASE_URL') || k === 'GITHUB_PAT' || k === 'DEFAULT_AI_MODEL');
    if (hasAiKey) {
      invalidateSettingsCache();
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedKeys.length} setting(s)`,
      data: { updatedKeys },
    });
  } catch (error) {
    console.error('[PUT /api/settings] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
