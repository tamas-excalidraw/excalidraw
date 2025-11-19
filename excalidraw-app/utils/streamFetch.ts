interface RateLimitInfo {
  rateLimit?: number;
  rateLimitRemaining?: number;
}

interface StreamingOptions {
  url: string;
  payload: any;
  onChunk?: (chunk: string) => void;
  parseChunk?: (data: string) => string | null;
  extractRateLimits?: boolean;
}

type StreamingResult = {
  rateLimit?: number | null;
  rateLimitRemaining?: number | null;
} & (
  | { generatedResponse: string | undefined; error?: null | undefined }
  | {
      error: Error;
      generatedResponse?: null | undefined;
    }
);

function extractRateLimitHeaders(headers: Headers): RateLimitInfo {
  const rateLimit = headers.get("X-Ratelimit-Limit");
  const rateLimitRemaining = headers.get("X-Ratelimit-Remaining");

  return {
    rateLimit: rateLimit ? parseInt(rateLimit, 10) : undefined,
    rateLimitRemaining: rateLimitRemaining
      ? parseInt(rateLimitRemaining, 10)
      : undefined,
  };
}

async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6);
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamFetch(
  options: StreamingOptions,
): Promise<StreamingResult> {
  const {
    url,
    payload,
    onChunk,
    parseChunk,
    extractRateLimits = true,
  } = options;

  try {
    let fullResponse = "";
    let rateLimitInfo: RateLimitInfo = {};
    let error: Error | null = null;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (extractRateLimits) {
      rateLimitInfo = extractRateLimitHeaders(response.headers);
    }

    if (!response.ok) {
      if (response.status === 429) {
        return {
          ...rateLimitInfo,
          error: new Error(
            "Too many requests today, please try again tomorrow!",
          ),
        };
      }

      const text = await response.text();
      throw new Error(text || "Generation failed...");
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("No response body");
    }

    try {
      let streamComplete = false;

      for await (const data of parseSSEStream(reader)) {
        if (data === "[DONE]") {
          streamComplete = true;
          break;
        }

        try {
          const chunk = parseChunk ? parseChunk(data) : data;

          if (chunk === null) {
            streamComplete = true;
            break;
          }

          if (chunk) {
            fullResponse += chunk;
            onChunk?.(chunk);
          }
        } catch (e) {
          console.warn("Failed to parse SSE data:", data, e);
        }
      }
    } catch (streamError: any) {
      error = new Error(streamError.message || "Streaming error");
    }

    if (error) {
      return {
        ...rateLimitInfo,
        error,
      };
    }

    if (!fullResponse) {
      return {
        ...rateLimitInfo,
        error: new Error("Generation failed..."),
      };
    }

    return {
      generatedResponse: fullResponse,
      ...rateLimitInfo,
    };
  } catch (err: any) {
    return {
      error: new Error(err.message || "Request failed"),
    };
  }
}

export function parseOpenAIStreamChunk(data: string): string | null {
  const json = JSON.parse(data);
  const choices = json.choices;

  if (choices && choices.length > 0) {
    const choice = choices[0];

    if (choice.finish_reason) {
      return null;
    }

    const delta = choice.delta;
    return delta?.content || "";
  }

  return "";
}
