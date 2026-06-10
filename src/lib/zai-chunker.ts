/**
 * z.ai Context Chunker
 *
 * Splits large project context into safe-sized chunks for the z.ai free tier API.
 * Sends chunks iteratively with delays to avoid rate limits, accumulating the
 * conversation so the AI builds understanding across all parts.
 *
 * Key design decisions:
 * - 14,000 chars per chunk (~4K tokens) — well within any free tier per-request limit
 * - Smart splitting at markdown boundaries (---, ##, \n\n) for clean breaks
 * - 3-second delay between chunks to avoid 429 rate limits
 * - Acknowledgment-only responses for intermediate chunks (max_tokens: 30)
 * - Full response requested only on the final chunk
 * - Graceful degradation: if a chunk fails, logs error and continues with next
 */

const MAX_CHARS_PER_CHUNK = 14_000; // ~4K tokens (conservative for free tier)
const INTER_CHUNK_DELAY_MS = 3_000; // Delay between chunk API calls
const INTER_CHUNK_MAX_TOKENS = 30; // AI just needs to say "Part X received"
const FINAL_MAX_TOKENS = 2048; // Actual response on final chunk
const REQUEST_TIMEOUT_MS = 30_000; // Per-request timeout

export interface ChunkResult {
  /** Whether all chunks were sent and a final AI response was received */
  success: boolean;
  /** The AI's final response (after receiving all chunks) */
  aiResponse: string;
  /** Total number of chunks the context was split into */
  totalChunks: number;
  /** Number of chunks actually sent to the API */
  chunksSent: number;
  /** If the final call failed, this contains the error description */
  apiError?: string;
  /** Human-readable progress string for the UI, e.g. "Sent 3/5 parts" */
  progress?: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Split text into chunks at natural markdown boundaries.
 * Tries to break at: `---` separators, then `##` headings, then `\n\n`, then `\n`.
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point
    const searchWindow = remaining.slice(0, maxChars);

    // Priority 1: Break at the last \n---\n (markdown horizontal rule / doc separator)
    let breakIdx = searchWindow.lastIndexOf("\n---\n");
    if (breakIdx > maxChars * 0.3) {
      breakIdx += 5; // include the \n---\n
      chunks.push(remaining.slice(0, breakIdx));
      remaining = remaining.slice(breakIdx);
      continue;
    }

    // Priority 2: Break at the last \n## (section heading)
    breakIdx = searchWindow.lastIndexOf("\n##");
    if (breakIdx > maxChars * 0.3) {
      chunks.push(remaining.slice(0, breakIdx));
      remaining = remaining.slice(breakIdx);
      continue;
    }

    // Priority 3: Break at the last \n\n (paragraph boundary)
    breakIdx = searchWindow.lastIndexOf("\n\n");
    if (breakIdx > maxChars * 0.3) {
      breakIdx += 2;
      chunks.push(remaining.slice(0, breakIdx));
      remaining = remaining.slice(breakIdx);
      continue;
    }

    // Priority 4: Break at the last \n (line boundary)
    breakIdx = searchWindow.lastIndexOf("\n");
    if (breakIdx > maxChars * 0.2) {
      breakIdx += 1;
      chunks.push(remaining.slice(0, breakIdx));
      remaining = remaining.slice(breakIdx);
      continue;
    }

    // Fallback: Hard break at maxChars
    chunks.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }

  return chunks;
}

/**
 * Send project context to z.ai in chunks, accumulating the conversation
 * so the AI sees all parts before generating a response.
 */
export async function sendChunkedContext(params: {
  context: string;
  systemPrompt: string;
  chatUrl: string;
  bearerToken: string;
  model: string;
  signal?: AbortSignal;
}): Promise<ChunkResult> {
  const chunks = splitIntoChunks(params.context, MAX_CHARS_PER_CHUNK);
  const totalChunks = chunks.length;

  console.log(`[zai-chunker] Context: ${params.context.length} chars → ${totalChunks} chunks`);

  // If only 1 chunk, send it directly (no iteration needed)
  if (totalChunks === 1) {
    const messages: Message[] = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: chunks[0] },
    ];

    try {
      const res = await fetch(params.chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${params.bearerToken}`,
        },
        body: JSON.stringify({ model: params.model, messages, max_tokens: FINAL_MAX_TOKENS }),
        signal: params.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          aiResponse: data.choices?.[0]?.message?.content || "",
          totalChunks: 1,
          chunksSent: 1,
          progress: "Sent 1/1 parts",
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
        apiError: `Network error: ${msg}`,
      };
    }
  }

  // Multiple chunks — send iteratively
  const messages: Message[] = [
    {
      role: "system",
      content:
        params.systemPrompt +
        `\n\nIMPORTANT: The user is sending a large project brief in ${totalChunks} parts. ` +
        `For each intermediate part, simply reply with "Part X of ${totalChunks} received. Waiting." ` +
        `Do NOT begin your analysis until you receive the final part. ` +
        `The final part will be explicitly marked as "FINAL PART". ` +
        `Only then should you provide your full response.`,
    },
  ];

  let lastAck = "";
  let chunksSent = 0;

  for (let i = 0; i < totalChunks; i++) {
    const isLast = i === totalChunks - 1;
    const label = isLast
      ? `FINAL PART (${i + 1}/${totalChunks}):`
      : `Part ${i + 1} of ${totalChunks}:`;

    messages.push({
      role: "user",
      content: `${label}\n\n${chunks[i]}`,
    });

    try {
      const res = await fetch(params.chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${params.bearerToken}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages,
          max_tokens: isLast ? FINAL_MAX_TOKENS : INTER_CHUNK_MAX_TOKENS,
        }),
        signal: params.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        chunksSent++;
        const data = await res.json();
        lastAck = data.choices?.[0]?.message?.content || "";

        // Add AI's acknowledgment to the conversation
        messages.push({ role: "assistant", content: lastAck });

        console.log(`[zai-chunker] Chunk ${i + 1}/${totalChunks} OK (${res.status})`);
      } else {
        chunksSent++;
        const errText = await res.text().catch(() => "");
        console.error(`[zai-chunker] Chunk ${i + 1}/${totalChunks} error:`, res.status, errText);

        if (res.status === 429 && !isLast) {
          // Rate limited mid-stream — wait longer before next chunk
          console.log(`[zai-chunker] Rate limited at chunk ${i + 1}, waiting 8s...`);
          await new Promise((r) => setTimeout(r, 8000));
          // Add a fake acknowledgment and continue
          messages.push({ role: "assistant", content: `Part ${i + 1} of ${totalChunks} received.` });
        } else if (isLast) {
          // Final chunk failed — this is the critical one
          return {
            success: false,
            aiResponse: "",
            totalChunks,
            chunksSent,
            apiError: buildApiError(res.status, errText),
            progress: `Sent ${chunksSent}/${totalChunks} parts (final chunk failed)`,
          };
        } else {
          // Intermediate chunk failed — add fake ack and continue
          messages.push({ role: "assistant", content: `Part ${i + 1} of ${totalChunks} received.` });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[zai-chunker] Chunk ${i + 1}/${totalChunks} network error:`, msg);

      if (isLast) {
        return {
          success: false,
          aiResponse: "",
          totalChunks,
          chunksSent,
          apiError: `Network error on final chunk: ${msg}`,
          progress: `Sent ${chunksSent}/${totalChunks} parts (final chunk network error)`,
        };
      }

      // Intermediate chunk network error — add fake ack and try next
      chunksSent++;
      messages.push({ role: "assistant", content: `Part ${i + 1} of ${totalChunks} received.` });
    }

    // Delay between chunks (skip after last)
    if (!isLast && i < totalChunks - 1) {
      await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
    }

    // Check if caller aborted
    if (params.signal?.aborted) {
      return {
        success: false,
        aiResponse: "",
        totalChunks,
        chunksSent,
        apiError: "Request was cancelled",
        progress: `Sent ${chunksSent}/${totalChunks} parts (cancelled)`,
      };
    }
  }

  // All chunks sent — extract the final response
  return {
    success: true,
    aiResponse: lastAck,
    totalChunks,
    chunksSent,
    progress: `Sent ${chunksSent}/${totalChunks} parts — complete`,
  };
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
    return `z.ai rate limited (429): ${detail}. Free tier limit reached. Wait 60 seconds and try again.`;
  }
  if (status === 401) {
    return `z.ai auth failed (401): ${detail}. Your API key may be expired. Check Settings → z.ai Bridge.`;
  }
  return `z.ai API error (${status}): ${detail}`;
}
