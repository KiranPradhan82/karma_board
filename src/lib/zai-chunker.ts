/**
 * z.ai Context Sender
 *
 * Sends project context to z.ai in a SINGLE API call with retry on 429.
 *
 * Why single call instead of chunked iteration:
 * - z.ai free tier has strict rate limits (~3-5 requests/minute)
 * - Chunked approach made 6-11 API calls → guaranteed 429 cascade
 * - glm-4.7-flash has 128K token context window
 * - Our docs are ~30K tokens max → fits in one request easily
 * - One request = one chance to hit rate limit = much more reliable
 *
 * Design:
 * - Single API call with all context (truncated to safe size)
 * - Exponential backoff on 429: 10s → 20s → 40s (max 3 retries)
 * - 60s request timeout (z.ai can be slow on free tier)
 * - Clean error messages with actionable guidance
 */

const MAX_CONTEXT_CHARS = 100_000; // ~25K tokens — safe for glm-4.7-flash 128K window
const REQUEST_TIMEOUT_MS = 60_000; // Per-request timeout
const MAX_429_RETRIES = 3; // Max retries on 429 rate limit
const BASE_429_DELAY_MS = 10_000; // Starting delay: 10s → 20s → 40s

export interface ChunkResult {
  /** Whether the API call succeeded and we got a response */
  success: boolean;
  /** The AI's response */
  aiResponse: string;
  /** Always 1 (single request) */
  totalChunks: number;
  /** 0 or 1 */
  chunksSent: number;
  /** If the call failed, this contains the error description */
  apiError?: string;
  /** Human-readable progress string for the UI */
  progress?: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Send project context to z.ai in a single API call with 429 retry.
 * This replaces the old chunked approach which made too many API calls
 * and consistently hit z.ai free tier rate limits.
 */
export async function sendChunkedContext(params: {
  context: string;
  systemPrompt: string;
  chatUrl: string;
  bearerToken: string;
  model: string;
  signal?: AbortSignal;
}): Promise<ChunkResult> {
  // Truncate context to safe size if needed
  const safeContext = params.context.length > MAX_CONTEXT_CHARS
    ? params.context.slice(0, MAX_CONTEXT_CHARS) + "\n\n... (context truncated to fit z.ai limits)"
    : params.context;

  const truncated = params.context.length > MAX_CONTEXT_CHARS;
  console.log(
    `[zai-sender] Context: ${params.context.length} chars` +
    (truncated ? ` (truncated to ${MAX_CONTEXT_CHARS})` : "") +
    ` → 1 API call`
  );

  const messages: Message[] = [
    { role: "system", content: params.systemPrompt },
    {
      role: "user",
      content: safeContext + "\n\n---\n\nPlease review this project brief and confirm you understand the requirements. Briefly summarize the key deliverables you can help build based on these documents.",
    },
  ];

  try {
    const res = await fetchWithRetry(
      params.chatUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${params.bearerToken}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages,
          max_tokens: 2048,
        }),
        signal: params.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
      MAX_429_RETRIES,
    );

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        aiResponse: data.choices?.[0]?.message?.content || "",
        totalChunks: 1,
        chunksSent: 1,
        progress: truncated ? "Sent (context truncated to fit limits)" : "Sent",
      };
    } else {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        aiResponse: "",
        totalChunks: 1,
        chunksSent: 1,
        apiError: buildApiError(res.status, errText),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      aiResponse: "",
      totalChunks: 1,
      chunksSent: 0,
      apiError: `Network error contacting z.ai: ${msg}. Check your connection and try again.`,
    };
  }
}

/**
 * Fetch with exponential backoff retry for 429 rate limits.
 * On 429, waits 10s → 20s → 40s before each retry.
 * On other HTTP errors, returns immediately (no retry).
 * On network errors, retries once then gives up.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status !== 429 || attempt === maxRetries) {
        return res;
      }
      // Rate limited — wait with exponential backoff
      const delay = Math.min(BASE_429_DELAY_MS * Math.pow(2, attempt), 60_000);
      console.log(`[zai-sender] 429 rate limit, attempt ${attempt + 1}/${maxRetries + 1}, waiting ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      // Network errors (timeout, DNS, etc.) — retry once then give up
      if (attempt === maxRetries) throw err;
      console.log(`[zai-sender] Network error, retrying in 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  // Should not reach here, but just in case
  return fetch(url, options);
}

/**
 * Build a human-readable API error string from status + response body.
 */
function buildApiError(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const json = JSON.parse(body);
    if (json.error?.message) detail = json.error.message;
  } catch { /* keep raw */ }

  if (status === 429) {
    return `z.ai rate limited (429): ${detail}. Free tier limit reached after 3 retries. Wait 2-3 minutes and try again, or use "Copy Context" to paste your docs directly in z.ai.`;
  }
  if (status === 401) {
    return `z.ai auth failed (401): ${detail}. Your API key may be expired. Check Settings → z.ai Bridge.`;
  }
  return `z.ai API error (${status}): ${detail}`;
}
