import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "../../types";

// API Types
export type OnTestSubmitRetValue = {
  rateLimit?: number | null;
  rateLimitRemaining?: number | null;
} & (
  | { generatedResponse: string | undefined; error?: null | undefined }
  | {
      error: Error;
      generatedResponse?: null | undefined;
    }
);

export type TTDPayload = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
};

export type MermaidData = {
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles | null;
};

export interface RateLimits {
  rateLimit: number;
  rateLimitRemaining: number;
}
