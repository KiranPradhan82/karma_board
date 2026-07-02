/**
 * Settings-based AI configuration resolver.
 *
 * Reads all AI provider keys and the GitHub PAT from the Settings DB
 * (encrypted via encryption.ts), falling back to environment variables.
 * This ensures the AI chat never needs any keys configured outside
 * the KarmaBoard settings UI.
 */

import { getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

// ===== Settings Key Constants =====
// These must match the keys used in the Settings UI (/dashboard/settings)

export const SETTINGS_KEYS = {
  // AI Provider API Keys
  GROQ_API_KEY: "GROQ_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  GOOGLE_AI_API_KEY: "GOOGLE_AI_API_KEY",
  TOGETHER_API_KEY: "TOGETHER_API_KEY",
  ZAI_API_KEY: "ZAI_API_KEY",
  SAMBANOVA_API_KEY: "SAMBANOVA_API_KEY",
  OPENROUTER_API_KEY: "OPENROUTER_API_KEY",

  // Provider Base URLs (optional overrides)
  GROQ_API_BASE_URL: "GROQ_API_BASE_URL",
  OPENAI_API_BASE_URL: "OPENAI_API_BASE_URL",
  GOOGLE_AI_API_BASE_URL: "GOOGLE_AI_API_BASE_URL",
  TOGETHER_API_BASE_URL: "TOGETHER_API_BASE_URL",
  ZAI_API_BASE_URL: "ZAI_API_BASE_URL",
  SAMBANOVA_API_BASE_URL: "SAMBANOVA_API_BASE_URL",
  OPENROUTER_API_BASE_URL: "OPENROUTER_API_BASE_URL",

  // Generic fallback
  AI_API_KEY: "AI_API_KEY",
  AI_API_BASE_URL: "AI_API_BASE_URL",

  // GitHub
  GITHUB_PAT: "GITHUB_PAT",

  // Default model
  DEFAULT_AI_MODEL: "DEFAULT_AI_MODEL",
} as const;

// Settings cache to avoid DB hit on every request
let _settingsCache: Record<string, string> | null = null;
let _settingsCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch all relevant settings from the Settings DB (encrypted values are decrypted).
 * Caches for 1 minute to reduce DB load.
 */
export async function getSettingsValues(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheTime < CACHE_TTL) {
    return _settingsCache;
  }

  try {
    const client = getTursoClient();
    const allKeys = Object.values(SETTINGS_KEYS);

    const placeholders = allKeys.map(() => "?").join(", ");
    const result = await client.execute({
      sql: `SELECT key, value FROM "Settings" WHERE key IN (${placeholders})`,
      args: allKeys,
    });

    const map: Record<string, string> = {};
    for (const row of result.rows) {
      const key = row.key as string;
      const rawValue = row.value as string;
      // Attempt to decrypt — if it fails, use as-is (might be unencrypted)
      try {
        map[key] = decrypt(rawValue);
      } catch {
        map[key] = rawValue;
      }
    }

    _settingsCache = map;
    _settingsCacheTime = now;
    return map;
  } catch (error) {
    console.error("[settings-resolver] Error reading settings:", error);
    return {};
  }
}

/**
 * Get a specific setting value, checking Settings DB first, then env vars.
 */
export async function getSetting(key: string): Promise<string> {
  const settings = await getSettingsValues();
  return settings[key] || process.env[key] || "";
}

/**
 * Get an API key for a provider.
 * Priority: Settings DB (encrypted) → Environment variable
 */
export async function getProviderApiKey(providerEnvKey: string): Promise<string> {
  const settings = await getSettingsValues();
  return settings[providerEnvKey] || process.env[providerEnvKey] || "";
}

/**
 * Get base URL for a provider.
 * Priority: Settings DB → Environment variable → Provider default
 */
export async function getProviderBaseUrl(
  providerEnvBaseUrl: string,
  defaultUrl: string,
): Promise<string> {
  const settings = await getSettingsValues();
  return (
    settings[providerEnvBaseUrl] ||
    process.env[providerEnvBaseUrl] ||
    defaultUrl
  );
}

/**
 * Get the GitHub PAT from settings (for AI tool execution).
 */
export async function getGitHubPat(): Promise<string> {
  return getProviderApiKey(SETTINGS_KEYS.GITHUB_PAT);
}

/**
 * Get all AI provider configurations in one call.
 * Returns a flat map: envKeyName → decrypted value.
 * Falls back to process.env for any missing setting.
 */
export async function getAllProviderConfigs(): Promise<Record<string, string>> {
  const settings = await getSettingsValues();
  const result: Record<string, string> = {};

  for (const key of Object.values(SETTINGS_KEYS)) {
    result[key] = settings[key] || process.env[key] || "";
  }

  return result;
}

/**
 * Invalidate the settings cache (call after settings are updated).
 */
export function invalidateSettingsCache(): void {
  _settingsCache = null;
  _settingsCacheTime = 0;
}