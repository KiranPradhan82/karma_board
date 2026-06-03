/**
 * Portable AI Client for Karma Space
 *
 * Makes direct HTTP calls to any OpenAI-compatible chat completions API.
 * No dependency on platform-specific SDKs or config files.
 *
 * Multi-Provider Support:
 *   Set provider-specific env vars to use multiple providers simultaneously:
 *     GROQ_API_KEY         - For Groq models (llama-3.3-70b, etc.)
 *     OPENAI_API_KEY       - For OpenAI models (gpt-4o, gpt-4o-mini, etc.)
 *     GOOGLE_AI_API_KEY    - For Google Gemini models (FREE — gemini-2.0-flash, etc.)
 *     TOGETHER_API_KEY     - For Together AI models
 *
 *   Generic fallback (backward compatible):
 *     AI_API_KEY           - Used when no provider-specific key is set
 *     AI_API_BASE_URL      - Base URL fallback
 *     AI_MODEL             - Global default model
 *     AI_VISION_MODEL      - Separate model for image analysis (optional)
 *
 * Model routing is handled by ai-models.ts — each model is mapped to its
 * provider, and the correct API key + base URL is auto-selected.
 */

// Re-export model utilities so existing imports continue to work
export {
  AVAILABLE_MODELS,
  getModelInfo,
  getGlobalDefaultModel,
  supportsMultimodal,
  getVisionModel,
  isAiConfigured,
  getConfiguredModels,
  getModelCapability,
  estimatePromptTokens,
  findBestModelForPrompt,
  isModelConfigured,
  getProviderConfig,
} from "./ai-models";
export type { AiModelOption, ModelCapability, ProviderConfig, ModelRouteResult } from "./ai-models";

// Internal import for use in this file
import { getProviderConfig, getGlobalDefaultModel } from "./ai-models";

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
  data: string; // base64 without data URL prefix
  type: string; // MIME type
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

/**
 * Send a chat completion request to the AI API.
 * Automatically routes to the correct provider based on the model.
 */
export async function chatCompletion(options: AiChatOptions): Promise<AiResponse> {
  const model = options.model || getGlobalDefaultModel();
  const { baseUrl, apiKey, provider } = getProviderConfig(model);

  if (!apiKey) {
    const cap = (await import("./ai-models")).getModelCapability(model);
    const keyHint = cap
      ? `Set ${cap.providerEnvKey} or AI_API_KEY environment variable.`
      : "Set AI_API_KEY environment variable.";
    return {
      success: false,
      content: "",
      error: `No API key configured for model "${model}" (provider: ${provider}). ${keyHint}`,
    };
  }

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

    const endpoint = baseUrl + "/chat/completions";
    console.log(`[ai-client] POST ${endpoint} model=${model} provider=${provider} messages=${options.messages.length} max_tokens=${requestBody.max_tokens} has_tools=${!!requestBody.tools}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[ai-client] API error (${response.status}) from ${provider}:`, errorBody.slice(0, 300));

      // Enhanced error messages for common issues
      let enhancedError = `AI API returned status ${response.status}: `;
      if (response.status === 413) {
        enhancedError += `Prompt too large for model "${model}". ` +
          `The prompt may exceed the model's context window or the provider's rate limits. ` +
          `Try using a model with a larger context window (e.g., Gemini 2.0 Flash with 1M context — free via Google AI Studio). ` +
          `Error: ${errorBody.slice(0, 200)}`;
      } else if (response.status === 401) {
        enhancedError += `Authentication failed for provider "${provider}". ` +
          `Check that the correct API key is set (${provider.toUpperCase()}_API_KEY or AI_API_KEY). ` +
          `Error: ${errorBody.slice(0, 200)}`;
      } else if (response.status === 404) {
        enhancedError += `Model "${model}" not found on provider "${provider}". ` +
          `The model may not be available on this provider. ` +
          `Error: ${errorBody.slice(0, 200)}`;
      } else {
        enhancedError += errorBody.slice(0, 200);
      }

      return {
        success: false,
        content: "",
        error: enhancedError,
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

    console.log(`[ai-client] Success: model=${data.model || model} tokens=${data.usage?.total_tokens || "unknown"} has_content=${!!content} has_tools=${!!toolCalls?.length}`);

    return {
      success: true,
      content: content || (toolCalls?.length ? "" : "No response generated."),
      model: data.model || model,
      usage: data.usage,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error(`[ai-client] Network error (${provider}):`, error);
    return {
      success: false,
      content: "",
      error: `Failed to reach AI service (${provider}): ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Send a vision (multimodal) chat completion request.
 * Automatically handles model differences — uses OpenAI multimodal format
 * for vision-capable models, and falls back to string-only for others.
 */
export async function visionCompletion(options: AiVisionOptions): Promise<AiResponse> {
  const model = options.model || getGlobalDefaultModel();
  const { baseUrl, apiKey, provider } = getProviderConfig(model);

  if (!apiKey) {
    return {
      success: false,
      content: "",
      error: `No API key configured for vision model "${model}" (provider: ${provider}). Set the appropriate API key.`,
    };
  }

  // Check if model supports OpenAI multimodal format
  const { supportsMultimodal } = await import("./ai-models");

  if (supportsMultimodal(model)) {
    try {
      const endpoint = baseUrl + "/chat/completions";
      console.log(`[ai-client] Vision POST ${endpoint} model=${model} provider=${provider}`);

      const response = await fetch(endpoint, {
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
        error: `Failed to reach AI vision service (${provider}): ${error instanceof Error ? error.message : "Unknown error"}`,
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
    const endpoint = baseUrl + "/chat/completions";
    const response = await fetch(endpoint, {
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
        error: `AI API returned status ${response.status}: ${errorBody.slice(0, 200)}`,
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
      error: `Failed to reach AI service (${provider}): ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
