/**
 * Portable AI Client for Karma Space
 *
 * Makes direct HTTP calls to any OpenAI-compatible chat completions API.
 * No dependency on platform-specific SDKs or config files.
 *
 * Required env vars (set in Vercel Dashboard > Settings > Environment Variables):
 *   AI_API_KEY     — Your API key (e.g. OpenAI, Groq, Together, etc.)
 *
 * Optional env vars:
 *   AI_API_BASE_URL — Base URL for the API (default: https://api.openai.com/v1)
 *   AI_MODEL        — Global default model (default: gpt-4o-mini)
 *   AI_VISION_MODEL — Separate model for image analysis (optional)
 */

// ===== Available AI Models =====
// SUPERADMIN can choose per-project. Edit this list to add/remove models.

export interface AiModelOption {
  id: string;
  name: string;
  description: string;
  contextWindow: string;
  category: string;
}

export const AVAILABLE_MODELS: AiModelOption[] = [
  // Groq Models
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    description: "Best quality, great for docs and complex tasks",
    contextWindow: "128K",
    category: "Groq",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    description: "Ultra fast, good for quick queries",
    contextWindow: "128K",
    category: "Groq",
  },
  {
    id: "llama-3.1-70b-versatile",
    name: "Llama 3.1 70B",
    description: "Strong reasoning, good all-rounder",
    contextWindow: "128K",
    category: "Groq",
  },
  {
    id: "mixtral-8x7b-32768",
    name: "Mixtral 8x7B",
    description: "Long context (32K), great for long documents",
    contextWindow: "32K",
    category: "Groq",
  },
  {
    id: "gemma2-9b-it",
    name: "Gemma 2 9B",
    description: "Google model, fast and efficient",
    contextWindow: "8K",
    category: "Groq",
  },
  // OpenAI Models
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Fast, affordable, great quality",
    contextWindow: "128K",
    category: "OpenAI",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Best quality, more expensive",
    contextWindow: "128K",
    category: "OpenAI",
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    description: "Fastest, cheapest, decent quality",
    contextWindow: "16K",
    category: "OpenAI",
  },
  // Together AI Models
  {
    id: "meta-llama/Llama-3-70b-chat-hf",
    name: "Llama 3 70B (Together)",
    description: "Strong open-source model via Together",
    contextWindow: "8K",
    category: "Together",
  },
  {
    id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    name: "Mixtral 8x7B (Together)",
    description: "Mixture of experts, good quality",
    contextWindow: "32K",
    category: "Together",
  },
];

/**
 * Get model display info by ID.
 */
export function getModelInfo(modelId: string): AiModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

/**
 * Get the global default model from env var.
 */
export function getGlobalDefaultModel(): string {
  return process.env.AI_MODEL || "llama-3.3-70b-versatile";
}

// ===== Types =====

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatOptions {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiVisionMessage {
  role: "system" | "user" | "assistant";
  content: string | AiMultimodalContent[];
}

export interface AiMultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface AiVisionOptions {
  messages: AiVisionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponse {
  success: boolean;
  content: string;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

// ===== Internal =====

function getConfig() {
  const baseUrl = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const defaultModel = process.env.AI_MODEL || "llama-3.3-70b-versatile";

  return { baseUrl, apiKey, defaultModel };
}

/**
 * Check if AI is properly configured.
 */
export function isAiConfigured(): boolean {
  const { apiKey } = getConfig();
  return !!apiKey;
}

/**
 * Send a chat completion request to the AI API.
 */
export async function chatCompletion(options: AiChatOptions): Promise<AiResponse> {
  const { baseUrl, apiKey, defaultModel } = getConfig();

  if (!apiKey) {
    return {
      success: false,
      content: "",
      error:
        "AI_API_KEY environment variable is not configured. Please set it in your Vercel project settings (Settings > Environment Variables).",
    };
  }

  const model = options.model || defaultModel;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ai-client] API error:", response.status, errorBody);
      return {
        success: false,
        content: "",
        error: `AI API returned status ${response.status}: ${errorBody.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response generated.";

    return {
      success: true,
      content,
      model: data.model || model,
      usage: data.usage,
    };
  } catch (error) {
    console.error("[ai-client] Network error:", error);
    return {
      success: false,
      content: "",
      error: `Failed to reach AI service: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Send a vision (multimodal) chat completion request.
 * Supports images via base64 data URLs.
 */
export async function visionCompletion(options: AiVisionOptions): Promise<AiResponse> {
  const { baseUrl, apiKey, defaultModel } = getConfig();

  if (!apiKey) {
    return {
      success: false,
      content: "",
      error:
        "AI_API_KEY environment variable is not configured. Please set it in your Vercel project settings (Settings > Environment Variables).",
    };
  }

  const model = options.model || defaultModel;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    });

    // If standard endpoint returns 404, try the vision-specific endpoint
    if (!response.ok && response.status === 404) {
      const visionResponse = await fetch(`${baseUrl}/chat/completions/vision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
        }),
      });

      if (!visionResponse.ok) {
        const errorBody = await visionResponse.text();
        return {
          success: false,
          content: "",
          error: `Vision API returned status ${visionResponse.status}: ${errorBody.slice(0, 200)}`,
        };
      }

      const data = await visionResponse.json();
      return {
        success: true,
        content: data.choices?.[0]?.message?.content || "No response generated.",
        model: data.model || model,
        usage: data.usage,
      };
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ai-client] Vision API error:", response.status, errorBody);
      return {
        success: false,
        content: "",
        error: `Vision API returned status ${response.status}: ${errorBody.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content || "No response generated.",
      model: data.model || model,
      usage: data.usage,
    };
  } catch (error) {
    console.error("[ai-client] Vision network error:", error);
    return {
      success: false,
      content: "",
      error: `Failed to reach AI vision service: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
