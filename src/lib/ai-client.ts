/**
 * Portable AI Client for Karma Space
 *
 * Makes direct HTTP calls to any OpenAI-compatible chat completions API.
 * No dependency on platform-specific SDKs or config files.
 *
 * Required env vars (set in Vercel Dashboard > Settings > Environment Variables):
 *   AI_API_KEY     — Your API key (e.g. OpenAI, z-ai, Together, etc.)
 *
 * Optional env vars:
 *   AI_API_BASE_URL — Base URL for the API (default: https://api.openai.com/v1)
 *   AI_MODEL        — Model name (default: gpt-4o-mini)
 */

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

function getConfig() {
  const baseUrl = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const defaultModel = process.env.AI_MODEL || "gpt-4o-mini";

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
