/**
 * GitHub-Driven AI Configuration System
 *
 * Reads/writes AI configuration YAML from the project's GitHub repo.
 * The config file lives at: config/karmaboard-ai.yaml
 *
 * This allows AI behavior (model routing, protocols, permissions) to be
 * version-controlled, reviewed via PRs, and audited through git history.
 */

import { getTursoClient } from "@/lib/api-auth";
import { getGitHubPat } from "@/lib/settings-resolver";
import type { GitHubConfig } from "@/lib/github-client";

// Extend github-client to support reading files
const GITHUB_API = "https://api.github.com";

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/\s#?]+)/i);
  if (!match) throw new Error("Invalid GitHub repository URL: " + url);
  return { owner: match[1], repo: match[2] };
}

/**
 * Read a file from GitHub repo.
 */
async function readFileFromGithub(config: GitHubConfig, path: string): Promise<string | null> {
  const info = parseRepoUrl(config.repoUrl);
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${info.owner}/${info.repo}/contents/${path}`,
      {
        headers: {
          Authorization: "Bearer " + config.token,
          Accept: "application/vnd.github.v3.raw",
          "User-Agent": "KarmaBoard/1.0",
        },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error (${res.status}): ${text}`);
    }
    return await res.text();
  } catch (error) {
    if ((error as Error).message?.includes("404")) return null;
    throw error;
  }
}

// ===== Config Types =====

export interface AiRoutingConfig {
  version: string;
  defaultModel: string;
  visionModel?: string;
  fallbackModels?: string[];
  modelRules?: ModelRoutingRule[];
}

export interface ModelRoutingRule {
  taskType: string;
  model: string;
  fallbackModel?: string;
  description?: string;
}

const DEFAULT_CONFIG_PATH = "config/karmaboard-ai.yaml";

/**
 * Parse a simple YAML-like config string into AiRoutingConfig.
 * Supports a subset of YAML that's sufficient for our needs.
 * Uses a simple parser rather than a full YAML library to avoid dependencies.
 */
export function parseRoutingConfig(raw: string): AiRoutingConfig | null {
  try {
    // Simple YAML parser for our flat structure
    const lines = raw.split("\n").map((l) => l.trimEnd());
    const config: AiRoutingConfig = {
      version: "1.0",
      defaultModel: "",
    };

    let currentRule: ModelRoutingRule | null = null;

    for (const line of lines) {
      // Skip comments and empty lines
      if (!line || line.startsWith("#")) continue;

      // Top-level scalar keys
      if (line.startsWith("version:")) {
        config.version = extractValue(line);
      } else if (line.startsWith("defaultModel:")) {
        config.defaultModel = extractValue(line);
      } else if (line.startsWith("visionModel:")) {
        config.visionModel = extractValue(line);
      } else if (line.startsWith("fallbackModels:")) {
        const val = extractValue(line);
        if (val.startsWith("[") && val.endsWith("]")) {
          config.fallbackModels = val
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/['"]/g, ""))
            .filter(Boolean);
        }
      } else if (line.startsWith("- taskType:")) {
        if (currentRule) config.modelRules = config.modelRules || [];
        if (!config.modelRules) config.modelRules = [];
        config.modelRules.push(currentRule);
        currentRule = { taskType: extractValue(line) };
      } else if (line.startsWith("taskType:") && !line.startsWith("- ")) {
        if (currentRule) config.modelRules = config.modelRules || [];
        if (!config.modelRules) config.modelRules = [];
        config.modelRules.push(currentRule);
        currentRule = { taskType: extractValue(line) };
      } else if (line.startsWith("model:") && currentRule) {
        currentRule.model = extractValue(line);
      } else if (line.startsWith("fallbackModel:") && currentRule) {
        currentRule.fallbackModel = extractValue(line);
      } else if (line.startsWith("description:") && currentRule) {
        currentRule.description = extractValue(line);
      }
    }

    // Push the last rule
    if (currentRule) {
      if (!config.modelRules) config.modelRules = [];
      config.modelRules.push(currentRule);
    }

    return config;
  } catch (error) {
    console.error("[github-config] Failed to parse routing config:", error);
    return null;
  }
}

function extractValue(line: string): string {
  const idx = line.indexOf(":");
  if (idx === -1) return line;
  let val = line.slice(idx + 1).trim();
  // Strip quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val;
}

/**
 * Serialize AiRoutingConfig back to YAML string.
 */
export function serializeRoutingConfig(config: AiRoutingConfig): string {
  const lines: string[] = [];
  lines.push(`# KarmaBoard AI Configuration`);
  lines.push(`# Managed via Settings UI. Do not edit manually unless reviewing via PR.`);
  lines.push(`version: "${config.version}"`);
  lines.push(`defaultModel: "${config.defaultModel}"`);
  if (config.visionModel) {
    lines.push(`visionModel: "${config.visionModel}"`);
  }
  if (config.fallbackModels && config.fallbackModels.length > 0) {
    const models = config.fallbackModels.map((m) => `"${m}"`).join(", ");
    lines.push(`fallbackModels: [${models}]`);
  }
  if (config.modelRules && config.modelRules.length > 0) {
    lines.push(``);
    lines.push(`# Model routing rules — maps task types to specific models`);
    lines.push(`modelRules:`);
    for (const rule of config.modelRules) {
      lines.push(`  - taskType: "${rule.taskType}"`);
      lines.push(`    model: "${rule.model}"`);
      if (rule.fallbackModel) {
        lines.push(`    fallbackModel: "${rule.fallbackModel}"`);
      }
      if (rule.description) {
        lines.push(`    description: "${rule.description}"`);
      }
    }
  }
  lines.push(``);
  return lines.join("\n");
}

/**
 * Get the GitHub config for the current project from Settings DB.
 */
async function getProjectGithubConfig(tursoClient: ReturnType<typeof getTursoClient>): Promise<GitHubConfig | null> {
  try {
    const repoResult = await tursoClient.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
      args: [],
    });
    if (repoResult.rows.length === 0) return null;

    const repoUrl = repoResult.rows[0].value as string;
    const pat = await getGitHubPat();
    if (!pat) return null;

    return { repoUrl, token: pat };
  } catch (error) {
    console.error("[github-config] Error getting project GitHub config:", error);
    return null;
  }
}

/**
 * Load the AI routing config from the project's GitHub repo.
 * Returns null if no GitHub config is set or the file doesn't exist.
 */
export async function loadRoutingConfigFromGithub(
  tursoClient?: ReturnType<typeof getTursoClient>,
): Promise<AiRoutingConfig | null> {
  try {
    const client = tursoClient || getTursoClient();
    const ghConfig = await getProjectGithubConfig(client);
    if (!ghConfig) return null;

    const raw = await readFileFromGithub(ghConfig, DEFAULT_CONFIG_PATH);
    if (!raw) return null;

    const parsed = parseRoutingConfig(raw);
    if (!parsed) return null;

    console.log("[github-config] Loaded routing config from GitHub:", JSON.stringify(parsed));
    return parsed;
  } catch (error) {
    console.error("[github-config] Error loading from GitHub:", error);
    return null;
  }
}

/**
 * Save the AI routing config to the project's GitHub repo.
 */
export async function saveRoutingConfigToGithub(
  config: AiRoutingConfig,
  tursoClient?: ReturnType<typeof getTursoClient>,
): Promise<{ success: boolean; error?: string; commitSha?: string }> {
  try {
    const client = tursoClient || getTursoClient();
    const ghConfig = await getProjectGithubConfig(client);
    if (!ghConfig) {
      return { success: false, error: "No GitHub repository configured. Set it in Settings." };
    }

    const yaml = serializeRoutingConfig(config);
    const { pushFile } = await import("@/lib/github-client");
    const result = await pushFile(
      ghConfig,
      DEFAULT_CONFIG_PATH,
      yaml,
      "config: update KarmaBoard AI model routing configuration",
    );

    console.log("[github-config] Saved routing config to GitHub, commit:", result.commitSha);
    return { success: true, commitSha: result.commitSha };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[github-config] Error saving to GitHub:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Resolve the best model for a given task type, considering:
 * 1. GitHub routing config rules (if available)
 * 2. User-specified model override
 * 3. Global default model
 * 4. Built-in model registry heuristics
 */
export async function resolveModelForTask(
  taskType: string,
  preferredModel?: string | null,
): Promise<{ model: string; reason: string }> {
  // 1. If user explicitly chose a model, respect it
  if (preferredModel) {
    return { model: preferredModel, reason: `User-selected model: ${preferredModel}` };
  }

  // 2. Try GitHub routing config
  const routingConfig = await loadRoutingConfigFromGithub();
  if (routingConfig) {
    // Check model rules
    if (routingConfig.modelRules) {
      const matchingRule = routingConfig.modelRules.find(
        (r) => r.taskType.toLowerCase() === taskType.toLowerCase(),
      );
      if (matchingRule?.model) {
        return {
          model: matchingRule.model,
          reason: `GitHub routing rule "${matchingRule.taskType}" → ${matchingRule.model}`,
        };
      }
    }
    // Fall back to default model from config
    if (routingConfig.defaultModel) {
      return {
        model: routingConfig.defaultModel,
        reason: `GitHub config default model: ${routingConfig.defaultModel}`,
      };
    }
  }

  // 3. Return empty — let the caller use its own default logic
  return { model: "", reason: "No GitHub routing config found" };
}