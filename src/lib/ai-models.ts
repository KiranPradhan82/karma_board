/**
 * AI Model Registry & Multi-Provider Configuration
 *
 * Maps each model to its capabilities and the provider it belongs to.
 * Supports multi-provider routing — automatically picks the right API
 * endpoint and key for each model.
 *
 * Provider priority for API key lookup:
 *   1. Provider-specific env var (e.g., GROQ_API_KEY)
 *   2. Generic fallback (AI_API_KEY)
 *
 * Provider priority for base URL:
 *   1. Provider-specific env var (e.g., GROQ_API_BASE_URL)
 *   2. Generic fallback (AI_API_BASE_URL)
 *   3. Provider's default URL
 */

// ===== Types =====

export interface ModelCapability {
  id: string;
  name: string;
  description: string;
  contextWindow: string; // Display string, e.g. "128K"
  contextWindowTokens: number; // Actual token count
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsMultimodal: boolean;
  category: string;
  provider: string;
  // Provider env var names
  providerEnvKey: string; // e.g. "GROQ_API_KEY"
  providerEnvBaseUrl: string; // e.g. "GROQ_API_BASE_URL"
  defaultBaseUrl: string; // fallback URL if no env var set
}

export interface AiModelOption {
  id: string;
  name: string;
  description: string;
  contextWindow: string;
  category: string;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  provider: string;
}

// ===== Model Capabilities Registry =====

const MODEL_REGISTRY: ModelCapability[] = [
  // ===== Groq Models =====
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    description: "Best quality, great for docs and complex tasks",
    contextWindow: "128K",
    contextWindowTokens: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Groq",
    provider: "groq",
    providerEnvKey: "GROQ_API_KEY",
    providerEnvBaseUrl: "GROQ_API_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    description: "Ultra fast, good for quick queries",
    contextWindow: "128K",
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Groq",
    provider: "groq",
    providerEnvKey: "GROQ_API_KEY",
    providerEnvBaseUrl: "GROQ_API_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "llama-3.1-70b-versatile",
    name: "Llama 3.1 70B",
    description: "Strong reasoning, good all-rounder",
    contextWindow: "128K",
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Groq",
    provider: "groq",
    providerEnvKey: "GROQ_API_KEY",
    providerEnvBaseUrl: "GROQ_API_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "mixtral-8x7b-32768",
    name: "Mixtral 8x7B",
    description: "Long context (32K), great for long documents",
    contextWindow: "32K",
    contextWindowTokens: 32768,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Groq",
    provider: "groq",
    providerEnvKey: "GROQ_API_KEY",
    providerEnvBaseUrl: "GROQ_API_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "gemma2-9b-it",
    name: "Gemma 2 9B",
    description: "Google model, fast and efficient",
    contextWindow: "8K",
    contextWindowTokens: 8192,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Groq",
    provider: "groq",
    providerEnvKey: "GROQ_API_KEY",
    providerEnvBaseUrl: "GROQ_API_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },

  // ===== OpenAI Models =====
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Fast, affordable, great quality",
    contextWindow: "128K",
    contextWindowTokens: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsMultimodal: true,
    category: "OpenAI",
    provider: "openai",
    providerEnvKey: "OPENAI_API_KEY",
    providerEnvBaseUrl: "OPENAI_API_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Best quality, more expensive",
    contextWindow: "128K",
    contextWindowTokens: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsMultimodal: true,
    category: "OpenAI",
    provider: "openai",
    providerEnvKey: "OPENAI_API_KEY",
    providerEnvBaseUrl: "OPENAI_API_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    description: "Fastest, cheapest, decent quality",
    contextWindow: "16K",
    contextWindowTokens: 16384,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "OpenAI",
    provider: "openai",
    providerEnvKey: "OPENAI_API_KEY",
    providerEnvBaseUrl: "OPENAI_API_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
  },

  // ===== Google Gemini (FREE) =====
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "FREE, 1M context, fast and powerful",
    contextWindow: "1M",
    contextWindowTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsMultimodal: true,
    category: "Google (Free)",
    provider: "google",
    providerEnvKey: "GOOGLE_AI_API_KEY",
    providerEnvBaseUrl: "GOOGLE_AI_API_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    description: "FREE, 1M context, fastest Gemini model",
    contextWindow: "1M",
    contextWindowTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsMultimodal: true,
    category: "Google (Free)",
    provider: "google",
    providerEnvKey: "GOOGLE_AI_API_KEY",
    providerEnvBaseUrl: "GOOGLE_AI_API_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "FREE tier, 1M context, best reasoning quality",
    contextWindow: "1M",
    contextWindowTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsMultimodal: true,
    category: "Google (Free)",
    provider: "google",
    providerEnvKey: "GOOGLE_AI_API_KEY",
    providerEnvBaseUrl: "GOOGLE_AI_API_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },

  // ===== Together AI Models =====
  {
    id: "meta-llama/Llama-3-70b-chat-hf",
    name: "Llama 3 70B (Together)",
    description: "Strong open-source model via Together",
    contextWindow: "8K",
    contextWindowTokens: 8192,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Together",
    provider: "together",
    providerEnvKey: "TOGETHER_API_KEY",
    providerEnvBaseUrl: "TOGETHER_API_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
  {
    id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    name: "Mixtral 8x7B (Together)",
    description: "Mixture of experts, good quality",
    contextWindow: "32K",
    contextWindowTokens: 32768,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsMultimodal: false,
    category: "Together",
    provider: "together",
    providerEnvKey: "TOGETHER_API_KEY",
    providerEnvBaseUrl: "TOGETHER_API_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
];

// Build lookup map
const MODEL_MAP: Record<string, ModelCapability> = {};
for (const m of MODEL_REGISTRY) {
  MODEL_MAP[m.id] = m;
}

// ===== Available Models List (for UI dropdown) =====

export const AVAILABLE_MODELS: AiModelOption[] = MODEL_REGISTRY.map((m) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  contextWindow: m.contextWindow,
  category: m.category,
}));

// ===== Exported Functions =====

/**
 * Get full model capability info by ID.
 */
export function getModelCapability(modelId: string): ModelCapability | undefined {
  return MODEL_MAP[modelId];
}

/**
 * Get model display info by ID (for UI).
 */
export function getModelInfo(modelId: string): AiModelOption | undefined {
  const cap = MODEL_MAP[modelId];
  if (!cap) return undefined;
  return {
    id: cap.id,
    name: cap.name,
    description: cap.description,
    contextWindow: cap.contextWindow,
    category: cap.category,
  };
}

/**
 * Get the global default model from env var.
 */
export function getGlobalDefaultModel(): string {
  return process.env.AI_MODEL || "llama-3.3-70b-versatile";
}

/**
 * Get the provider configuration (baseUrl + apiKey) for a given model.
 *
 * Lookup priority:
 *   1. Provider-specific env var (e.g., GROQ_API_KEY)
 *   2. Generic fallback (AI_API_KEY)
 *   3. Provider's default base URL for baseUrl
 */
export function getProviderConfig(modelId: string): ProviderConfig {
  const cap = MODEL_MAP[modelId];

  if (!cap) {
    // Unknown model — use generic config
    const baseUrl = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
    const apiKey = process.env.AI_API_KEY || "";
    return { baseUrl, apiKey, provider: "unknown" };
  }

  // API key: provider-specific first, then generic fallback
  const apiKey = process.env[cap.providerEnvKey] || process.env.AI_API_KEY || "";

  // Base URL: provider-specific first, then generic fallback, then provider default
  const baseUrl =
    process.env[cap.providerEnvBaseUrl] ||
    process.env.AI_API_BASE_URL ||
    cap.defaultBaseUrl;

  return { baseUrl, apiKey, provider: cap.provider };
}

/**
 * Check if a model supports OpenAI-style multimodal content (image_url array format).
 */
export function supportsMultimodal(modelId?: string): boolean {
  const model = modelId || getGlobalDefaultModel();
  const cap = MODEL_MAP[model];
  return cap?.supportsMultimodal || false;
}

/**
 * Get the vision model to use.
 * Falls back to AI_VISION_MODEL env var, then checks if the current model
 * supports vision, and finally defaults to the first configured vision-capable model.
 */
export function getVisionModel(preferredModel?: string): string {
  // 1. If AI_VISION_MODEL is set, use it
  if (process.env.AI_VISION_MODEL) return process.env.AI_VISION_MODEL;
  // 2. If preferred model supports multimodal, use it
  if (preferredModel && supportsMultimodal(preferredModel)) return preferredModel;
  // 3. Find a vision-capable model that has its provider configured
  for (const m of MODEL_REGISTRY) {
    if (m.supportsMultimodal) {
      const config = getProviderConfig(m.id);
      if (config.apiKey) return m.id;
    }
  }
  // 4. Default to gpt-4o-mini (best cost/vision quality)
  return "gpt-4o-mini";
}

/**
 * Check if AI is configured for at least one provider.
 */
export function isAiConfigured(): boolean {
  if (process.env.AI_API_KEY) return true;
  if (process.env.GROQ_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  if (process.env.GOOGLE_AI_API_KEY) return true;
  if (process.env.TOGETHER_API_KEY) return true;
  return false;
}

/**
 * Check if a specific model has its provider API key configured.
 */
export function isModelConfigured(modelId: string): boolean {
  const config = getProviderConfig(modelId);
  return !!config.apiKey;
}

/**
 * Get a list of all models that currently have API keys configured.
 * Useful for UI to only show usable models in the dropdown.
 */
export function getConfiguredModels(): AiModelOption[] {
  return MODEL_REGISTRY
    .filter((m) => isModelConfigured(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextWindow: m.contextWindow,
      category: m.category,
    }));
}

// ===== Token Estimation =====

/**
 * Estimate the number of tokens in a text string.
 * Rough heuristic: ~4 characters per token for English, ~1.5 for CJK.
 */
function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 0x2e7f) {
      // CJK and other non-Latin: ~1.5 chars per token
      tokens += 0.67;
    } else {
      // Latin: ~4 chars per token
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Estimate total prompt tokens for an array of AI messages.
 */
export function estimatePromptTokens(
  messages: Array<{ role: string; content: string | unknown }>,
  tools?: unknown[]
): number {
  let totalTokens = 0;

  // Estimate message tokens
  for (const msg of messages) {
    totalTokens += 4; // overhead per message (role, formatting)
    if (typeof msg.content === "string") {
      totalTokens += estimateTextTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      // Multimodal content
      for (const part of msg.content) {
        if (typeof part === "object" && part !== null) {
          if ("text" in part && typeof part.text === "string") {
            totalTokens += estimateTextTokens(part.text);
          }
          if ("image_url" in part) {
            totalTokens += 85; // low detail image ~85 tokens
          }
        }
      }
    }
  }

  // Estimate tool tokens (each tool definition adds ~100-300 tokens)
  if (tools && tools.length > 0) {
    for (const tool of tools) {
      totalTokens += estimateTextTokens(JSON.stringify(tool));
    }
  }

  return totalTokens;
}

// ===== Automatic Model Routing =====

/**
 * Routing result from findBestModelForPrompt().
 */
export interface ModelRouteResult {
  model: string;
  reason: string;
  autoRouted: boolean;
}

/**
 * Find the best available model for a given estimated prompt size.
 *
 * Logic:
 *   1. If preferred model can handle it AND is configured -> use it
 *   2. Search for the smallest configured model with enough context
 *   3. Fallback to preferred model (let it fail with its own error message)
 *
 * @param estimatedTokens  - Estimated token count of the full prompt
 * @param preferredModel   - The model the user/system originally selected
 * @param requiredFeatures - Optional feature requirements (tools, vision)
 */
export function findBestModelForPrompt(
  estimatedTokens: number,
  preferredModel: string,
  requiredFeatures?: { tools?: boolean; vision?: boolean }
): ModelRouteResult {
  const preferred = MODEL_MAP[preferredModel];

  // 1. Check if preferred model can handle the prompt
  if (preferred && isModelConfigured(preferredModel)) {
    // Leave 20% headroom for the response tokens
    const maxPromptTokens = Math.floor(preferred.contextWindowTokens * 0.8);
    if (estimatedTokens <= maxPromptTokens) {
      return {
        model: preferredModel,
        reason: "Preferred model has sufficient capacity",
        autoRouted: false,
      };
    }
    // Preferred model is too small — we need to find an alternative
  }

  // 2. Find the best alternative model
  const candidates = MODEL_REGISTRY.filter((m) => {
    // Must have API key configured
    if (!isModelConfigured(m.id)) return false;
    // Must support required features
    if (requiredFeatures?.tools && !m.supportsTools) return false;
    if (requiredFeatures?.vision && !m.supportsVision) return false;
    // Must have enough context (80% of window reserved for prompt)
    const maxPromptTokens = Math.floor(m.contextWindowTokens * 0.8);
    return estimatedTokens <= maxPromptTokens;
  });

  if (candidates.length > 0) {
    // Sort: prefer models that are "just big enough" (avoid wasteful 1M context for small prompts)
    // but break ties by preferring well-known quality models
    const qualityOrder: Record<string, number> = {
      "gemini-2.0-flash": 1,
      "gpt-4o-mini": 2,
      "gemini-1.5-flash": 3,
      "llama-3.3-70b-versatile": 4,
      "gpt-4o": 5,
      "llama-3.1-70b-versatile": 6,
      "gemini-1.5-pro": 7,
      "llama-3.1-8b-instant": 8,
      "gpt-3.5-turbo": 9,
    };

    candidates.sort((a, b) => {
      const aSurplus = a.contextWindowTokens - estimatedTokens;
      const bSurplus = b.contextWindowTokens - estimatedTokens;
      // Both can handle it — prefer the one with context closer to our needs
      if (aSurplus >= 0 && bSurplus >= 0) {
        // If both have similar surplus (within 2x), prefer by quality
        const aQ = qualityOrder[a.id] ?? 50;
        const bQ = qualityOrder[b.id] ?? 50;
        if (Math.abs(aSurplus - bSurplus) < estimatedTokens) {
          return aQ - bQ; // prefer higher quality
        }
        return aSurplus - bSurplus; // prefer smaller surplus
      }
      return b.contextWindowTokens - a.contextWindowTokens;
    });

    const best = candidates[0];
    return {
      model: best.id,
      reason: `Preferred model "${preferredModel}" may not handle ~${estimatedTokens.toLocaleString()} tokens well. Auto-routed to "${best.name}" (${best.contextWindow} context, ${best.category})`,
      autoRouted: true,
    };
  }

  // 3. No suitable model found — return a helpful error message
  const configuredProviders: string[] = [];
  if (process.env.GROQ_API_KEY) configuredProviders.push("Groq");
  if (process.env.OPENAI_API_KEY) configuredProviders.push("OpenAI");
  if (process.env.GOOGLE_AI_API_KEY) configuredProviders.push("Google");
  if (process.env.TOGETHER_API_KEY) configuredProviders.push("Together");
  if (process.env.AI_API_KEY) configuredProviders.push("Generic (AI_API_KEY)");

  const providerHint =
    configuredProviders.length > 0
      ? ` Configured providers: ${configuredProviders.join(", ")}.`
      : " No AI providers are configured.";

  return {
    model: preferredModel,
    reason: `No configured model can handle ~${estimatedTokens.toLocaleString()} tokens.${providerHint} Add GOOGLE_AI_API_KEY for free 1M-context Gemini models, or OPENAI_API_KEY for GPT-4o models.`,
    autoRouted: false,
  };
}
