/**
 * Portable AI Client for Karma Space
 *
 * Makes direct HTTP calls to any OpenAI-compatible chat completions API.
 * No dependency on platform-specific SDKs or config files.
 *
 * Required env vars (set in Vercel Dashboard > Settings > Environment Variables):
 *   AI_API_KEY     - Your API key (e.g. OpenAI, Groq, Together, etc.)
 *
 * Optional env vars:
 *   AI_API_BASE_URL - Base URL for the API (default: https://api.openai.com/v1)
 *   AI_MODEL        - Global default model (default: gpt-4o-mini)
 *   AI_VISION_MODEL - Separate model for image analysis (optional)
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

export interface AiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AiChatOptions {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
  tool_choice?: "auto" | "none" | { type: string; function: { name: string } };
}

export interface AiVisionMessage {
  role: "system" | "user" | "assistant";
  content: string | AiMultimodalContent[];
}

export interface AiMultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: string };
}

export interface AttachedImage {
  data: string;   // base64 without data URL prefix
  type: string;   // MIME type
  name: string;
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
  tool_calls?: AiToolCall[];
}

// ===== Internal =====

function getConfig() {
  const baseUrl = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const defaultModel = process.env.AI_MODEL || "llama-3.3-70b-versatile";

  return { baseUrl, apiKey, defaultModel };
}

/**
 * Check if a model supports OpenAI-style multimodal content (image_url array format).
 * Groq, Together, and most non-OpenAI providers do NOT support this.
 */
export function supportsMultimodal(modelId?: string): boolean {
  const model = modelId || getConfig().defaultModel;
  // OpenAI models with vision support
  return model.startsWith("gpt-4o") || model.startsWith("gpt-4-turbo") || model === "chatgpt-4o-latest";
}

/**
 * Get the vision model to use. Falls back to AI_VISION_MODEL env var,
 * then checks if the current model supports vision, and finally defaults to gpt-4o-mini.
 */
export function getVisionModel(preferredModel?: string): string {
  // 1. If AI_VISION_MODEL is set, use it
  if (process.env.AI_VISION_MODEL) return process.env.AI_VISION_MODEL;
  // 2. If preferred model supports vision, use it
  if (preferredModel && supportsMultimodal(preferredModel)) return preferredModel;
  // 3. Default to gpt-4o-mini (best cost/vision quality)
  return "gpt-4o-mini";
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
      error: "AI_API_KEY environment variable is not configured.",
    };
  }

  const model = options.model || defaultModel;

  try {
    const requestBody: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    // Add tools if provided (for agentic/function calling)
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.tool_choice || "auto";
    }

    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ai-client] API error:", response.status, errorBody);
      return {
        success: false,
        content: "",
        error: "AI API returned status " + response.status + ": " + errorBody.slice(0, 200),
      };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const content = message?.content || "";
    const toolCalls = message?.tool_calls?.map((tc: Record<string, unknown>) => ({
      id: tc.id as string,
      type: "function" as const,
      function: {
        name: (tc.function as Record<string, unknown>).name as string,
        arguments: (tc.function as Record<string, unknown>).arguments as string,
      },
    }));

    return {
      success: true,
      content: content || (toolCalls?.length ? "" : "No response generated."),
      model: data.model || model,
      usage: data.usage,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error("[ai-client] Network error:", error);
    return {
      success: false,
      content: "",
      error: "Failed to reach AI service: " + (error instanceof Error ? error.message : "Unknown error"),
    };
  }
}

/**
 * Send a vision (multimodal) chat completion request.
 * Automatically handles model differences - uses OpenAI multimodal format for vision-capable models,
 * and falls back to string-only for models that do not support multimodal content arrays.
 */
export async function visionCompletion(options: AiVisionOptions): Promise<AiResponse> {
  const { baseUrl, apiKey, defaultModel } = getConfig();

  if (!apiKey) {
    return {
      success: false,
      content: "",
      error: "AI_API_KEY environment variable is not configured.",
    };
  }

  const model = options.model || defaultModel;

  // Check if model supports OpenAI multimodal format
  if (supportsMultimodal(model)) {
    try {
      const response = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
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
        console.error("[ai-client] Vision API error:", response.status, errorBody);
        return {
          success: false,
          content: "",
          error: "Vision API returned status " + response.status + ": " + errorBody.slice(0, 200),
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
        error: "Failed to reach AI vision service: " + (error instanceof Error ? error.message : "Unknown error"),
      };
    }
  }

  // === Fallback: Model does not support multimodal content arrays ===
  // Convert multimodal messages to string-only format
  const fallbackMessages: { role: string; content: string }[] = options.messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    const textParts = msg.content.filter((p) => p.type === "text").map((p) => p.text || "");
    const imageCount = msg.content.filter((p) => p.type === "image_url").length;
    const textContent = textParts.join("\n");
    let imageNote = "";
    if (imageCount > 0) {
      const plural = imageCount > 1 ? "s" : "";
      imageNote = "\n\n[Note: The user attached " + imageCount + " image" + plural + ". This model cannot view images directly. Please describe what you observe or ask the user to describe the image contents.]";
    }
    return { role: msg.role, content: textContent + imageNote };
  });

  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: fallbackMessages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[ai-client] Vision fallback API error:", response.status, errorBody);
      return {
        success: false,
        content: "",
        error: "AI API returned status " + response.status + ": " + errorBody.slice(0, 200),
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
    console.error("[ai-client] Vision fallback network error:", error);
    return {
      success: false,
      content: "",
      error: "Failed to reach AI service: " + (error instanceof Error ? error.message : "Unknown error"),
    };
  }
}
